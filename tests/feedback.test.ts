import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { Services, CommandResult } from '../src/main/context.js';
import { handleFeedback, parseImages } from '../src/main/feedback.js';
import { FEEDBACK_REPOSITORY, buildIssueBody, buildIssueTitle, detectImageType } from '../src/shared/feedback.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const GIST = 'abc123def456';
const SHA = 'a'.repeat(40);
const windows = process.platform === 'win32';
let root: string;
let originalPath: string | undefined;

// `resolveTool` procura executáveis no PATH real; stubs vazios bastam porque o capture é roteirizado.
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'feedback-'));
  const bin = join(root, 'bin');
  await mkdir(bin);
  for (const name of ['gh', 'git']) { await writeFile(join(bin, name), '#!/bin/sh\n'); await chmod(join(bin, name), 0o755); }
  originalPath = process.env.PATH;
  process.env.PATH = [bin, originalPath].filter(Boolean).join(delimiter);
});
after(async () => { process.env.PATH = originalPath; await rm(root, { recursive: true, force: true }); });

type Call = { executable: string; args: string[]; input?: string; body?: string };
function harness(respond: (call: Call) => Partial<CommandResult> | undefined = () => undefined) {
  const calls: Call[] = [];
  const services = {
    dataDir: join(root, 'data'),
    getSettings: () => ({ provider: 'claude', enginePaths: {}, workspace: root, onboardingCompleted: true }),
    capture: async (executable: string, args: string[], options: { input?: string; cwd?: string } = {}): Promise<CommandResult> => {
      const call: Call = { executable, args, input: options.input };
      const flag = args.indexOf('--body-file');
      if (flag >= 0) call.body = await readFile(args[flag + 1]!, 'utf8');
      calls.push(call);
      const custom = respond(call);
      if (custom) return { code: 0, stdout: '', stderr: '', ...custom };
      if (args[0] === 'auth') return { code: 0, stdout: 'Logged in to github.com account octo (keyring)', stderr: '' };
      if (args.includes('POST')) return { code: 0, stdout: JSON.stringify({ id: GIST, owner: { login: 'octo' } }), stderr: '' };
      if (args.includes('clone')) { await mkdir(args.at(-1)!, { recursive: true }); return { code: 0, stdout: '', stderr: '' }; }
      if (args.includes('rev-parse')) return { code: 0, stdout: `${SHA}\n`, stderr: '' };
      if (args[0] === 'issue') return { code: 0, stdout: `https://github.com/${FEEDBACK_REPOSITORY}/issues/42\n`, stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
  } as unknown as Services;
  return { services, calls };
}
const base = { confirm: true, kind: 'bug', title: '  Capa   sem logo ', message: 'A logo some na capa.' };
const send = (payload: Record<string, unknown>, services: Services) => handleFeedback('feedback.send', payload, services, { version: '1.2.3' });

test('detectImageType trusts bytes, not names, and rejects non-raster payloads', () => {
  assert.equal(detectImageType(PNG), 'png');
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(detectImageType(Buffer.from('GIF89a....')), 'gif');
  assert.equal(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), undefined);
  assert.equal(detectImageType(PNG.subarray(0, 4)), undefined);
});

test('parseImages enforces count, size and real image content', () => {
  assert.deepEqual(parseImages(undefined), []);
  assert.equal(parseImages([{ data: PNG.toString('base64') }])[0]!.type, 'png');
  assert.throws(() => parseImages([{ data: Buffer.from('not an image').toString('base64') }]), /não é PNG/);
  assert.throws(() => parseImages(Array.from({ length: 5 }, () => ({ data: PNG.toString('base64') }))), /no máximo 4/);
  assert.throws(() => parseImages([{ data: Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]).toString('base64') }]), /passa de 5 MB/);
  assert.throws(() => parseImages([{ data: '' }]), /vazia/);
});

test('issue title and body keep the user text, add images and fold diagnostics', () => {
  assert.equal(buildIssueTitle('suggestion', '  Modo   escuro \n'), '[Sugestão] Modo escuro');
  const body = buildIssueBody({ message: 'Texto', imageUrls: ['https://x/1.png', 'https://x/2.png'], version: '1.2.3', diagnostics: { version: '1.2.3', system: 'linux x64', provider: 'Codex' } });
  assert.match(body, /^Texto\n\n!\[Imagem 1\]\(https:\/\/x\/1\.png\)\n\n!\[Imagem 2\]\(https:\/\/x\/2\.png\)/);
  assert.match(body, /<details>[\s\S]*Sistema: linux x64[\s\S]*<\/details>/);
  assert.doesNotMatch(buildIssueBody({ message: 'a', imageUrls: [], version: '1' }), /<details>|!\[/);
});

test('feedback.send requires explicit confirmation and a valid kind before touching GitHub', async () => {
  const { services, calls } = harness();
  await assert.rejects(send({ ...base, confirm: undefined }, services), /confirmação/);
  await assert.rejects(send({ ...base, kind: 'spam' }, services), /tipo/);
  await assert.rejects(send({ ...base, title: '   ' }, services), /title/);
  assert.equal(calls.length, 0);
});

test('feedback.send refuses to run without a connected GitHub account', { skip: windows }, async () => {
  const { services, calls } = harness(call => call.args[0] === 'auth' ? { code: 1, stderr: 'You are not logged into any GitHub hosts.' } : undefined);
  await assert.rejects(send(base, services), /Conecte sua conta do GitHub/);
  assert.deepEqual(calls.map(call => call.args[0]), ['auth']);
});

test('feedback.send without images opens the issue in the repository through gh, with no gist', { skip: windows }, async () => {
  const { services, calls } = harness();
  const result = await send({ ...base, includeDiagnostics: true }, services);
  assert.deepEqual(result, { url: `https://github.com/${FEEDBACK_REPOSITORY}/issues/42`, number: 42, images: 0 });
  const create = calls.find(call => call.args[0] === 'issue')!;
  assert.deepEqual(create.args.slice(0, 6), ['issue', 'create', '--repo', FEEDBACK_REPOSITORY, '--title', '[Bug] Capa sem logo']);
  assert.deepEqual(create.args.slice(-2), ['--label', 'bug']);
  assert.match(create.body!, /A logo some na capa\./);
  assert.match(create.body!, /Agente padrão: Claude Code/);
  assert.match(create.body!, /Studio v1\.2\.3/);
  assert.equal(calls.some(call => call.args.includes('gists')), false);
});

test('feedback.send maps each chosen type to its repository label', { skip: windows }, async () => {
  for (const [kind, label] of [['bug', 'bug'], ['suggestion', 'enhancement'], ['question', 'question']] as const) {
    const { services, calls } = harness();
    await send({ ...base, kind }, services);
    const create = calls.find(call => call.args[0] === 'issue')!;
    assert.equal(create.args[create.args.indexOf('--label') + 1], label);
  }
});

test('feedback.send still opens the issue, unlabeled, when the repository rejects the label', { skip: windows }, async () => {
  let attempts = 0;
  const { services, calls } = harness(call => {
    if (call.args[0] !== 'issue') return undefined;
    return attempts++ === 0 ? { code: 1, stderr: "could not add label: 'bug' not found" } : undefined;
  });
  const result = await send(base, services);
  assert.equal(result.number, 42);
  const creates = calls.filter(call => call.args[0] === 'issue');
  assert.equal(creates.length, 2);
  assert.ok(creates[0]!.args.includes('--label'));
  assert.equal(creates[1]!.args.includes('--label'), false);
});

test('feedback.send omits diagnostics unless requested', { skip: windows }, async () => {
  const { services, calls } = harness();
  await send(base, services);
  assert.doesNotMatch(calls.find(call => call.args[0] === 'issue')!.body!, /<details>/);
});

test('feedback.send hosts images in a secret gist pushed with the gh credential helper and links the pinned raw URL', { skip: windows }, async () => {
  const { services, calls } = harness();
  const result = await send({ ...base, images: [{ data: PNG.toString('base64') }] }, services);
  assert.equal(result.images, 1);
  const create = calls.find(call => call.args.includes('POST'))!;
  assert.equal(JSON.parse(create.input!).public, false);
  const git = calls.filter(call => call.args.includes('clone') || call.args.includes('push'));
  for (const call of git) assert.ok(call.args.includes('credential.https://gist.github.com.helper=!gh auth git-credential'), 'helper limited to the gist host');
  assert.ok(calls.some(call => call.args.includes('commit') && call.args.includes('user.email=octo@users.noreply.github.com')));
  assert.match(calls.find(call => call.args[0] === 'issue')!.body!, new RegExp(`!\\[Imagem 1\\]\\(https://gist\\.githubusercontent\\.com/octo/${GIST}/raw/${SHA}/imagem-1\\.png\\)`));
  assert.equal(calls.some(call => call.args.includes('DELETE')), false, 'gist is kept once the issue references it');
});

test('feedback.send deletes the gist when the issue cannot be created and hides raw gh output', { skip: windows }, async () => {
  const { services, calls } = harness(call => call.args[0] === 'issue' ? { code: 1, stderr: 'secret-internal-detail' } : undefined);
  await assert.rejects(send({ ...base, images: [{ data: PNG.toString('base64') }] }, services), error => {
    assert.match((error as Error).message, /Não foi possível criar o issue/);
    assert.doesNotMatch((error as Error).message, /secret-internal-detail/);
    return true;
  });
  assert.ok(calls.some(call => call.args.includes('DELETE') && call.args.includes(`gists/${GIST}`)));
});

test('feedback.send deletes the gist when the push fails and points to the missing gist scope', { skip: windows }, async () => {
  const { services, calls } = harness(call => call.args.includes('push') ? { code: 1, stderr: 'remote: gist scope required 403' } : undefined);
  await assert.rejects(send({ ...base, images: [{ data: PNG.toString('base64') }] }, services), /permissão "gist"/);
  assert.ok(calls.some(call => call.args.includes('DELETE')));
  assert.equal(calls.some(call => call.args[0] === 'issue'), false);
});
