import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { RunSpec } from '../src/main/context.js';
import type { Job, Project, ProjectDetail } from '../src/shared/contracts.js';

const CAPTION = 'Uma descrição para o YouTube.\n\n#video #youtube #dicas #conteudo #social';

function promptOf(args: string[]): string {
  return args.includes('-p') ? args[args.indexOf('-p') + 1]! : args[args.length - 1]!;
}
function copyTarget(args: string[]): string {
  return /Salve somente o texto final em (\S+\.txt)\./.exec(promptOf(args))![1]!;
}

test('video delivery takes the cover from Codex ImageGen and the caption from Claude Opus, falling back to Codex Luna, and always requires 5 hashtags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-video-delivery-'));
  const data = join(root, 'data');
  const codex = join(data, 'runtime', 'tools', 'codex', 'node_modules', '.bin', 'codex');
  const claude = join(data, 'runtime', 'tools', 'claude', 'node_modules', '.bin', 'claude');
  const runtime = new Runtime(data, {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('not available'); }, decryptSecret: () => { throw new Error('not available'); },
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined,
    update: async () => ({ available: false, message: '' }),
  }, () => undefined);
  try {
    for (const tool of [codex, claude]) {
      await mkdir(dirname(tool), { recursive: true });
      await writeFile(tool, '#!/bin/sh\nexit 0\n'); await chmod(tool, 0o700);
    }
    await runtime.init(); await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    const project = await runtime.invoke('projects.create', { title: 'Vídeo', kind: 'video', format: 'youtube', brief: 'Vídeo para publicação' }) as Project;
    const specs: RunSpec[] = [];
    const job: Job = { id: 'job', title: 'Codex', status: 'running', createdAt: '', log: '', interactive: false, projectId: project.id };
    // O lançador avisa quando um job chega: o plano B nasce de uma cadeia assíncrona e o teste espera esse sinal, não um tempo.
    const waiters: { count: number; resolve: () => void }[] = [];
    runtime.services.run = async input => {
      specs.push(input);
      for (const waiter of waiters.splice(0)) { if (specs.length >= waiter.count) waiter.resolve(); else waiters.push(waiter); }
      return job;
    };
    const runsReach = (count: number): Promise<void> => specs.length >= count ? Promise.resolve() : new Promise<void>(resolve => { waiters.push({ count, resolve }); });
    runtime.services.waitJob = async () => ({ ...job, status: 'failed' });
    // Stand-ins for the two text writers: each writes the caption only when told to and records the model it was asked for.
    const behavior: { claude: 'caption' | 'nothing' | 'no-hashtags' | 'crash'; codex: 'caption' | 'nothing' } = { claude: 'nothing', codex: 'nothing' };
    const asked: string[] = [];
    const realCapture = runtime.services.capture.bind(runtime.services);
    runtime.services.capture = async (executable, args, options) => {
      if (executable !== claude && executable !== codex) return realCapture(executable, args, options);
      const kind = executable === claude ? 'claude' : 'codex';
      asked.push(`${kind}:${args[args.indexOf('--model') + 1]}`);
      const mode = behavior[kind];
      if (mode === 'crash') return { code: 1, stdout: '', stderr: 'account limit' };
      if (mode === 'caption') await writeFile(copyTarget(args), CAPTION);
      if (mode === 'no-hashtags') await writeFile(copyTarget(args), 'Uma descrição sem hashtags.');
      return { code: 0, stdout: '', stderr: '' };
    };
    const deliveryStages = async () => (await readdir(join(project.path, '.studio-context')).catch(() => [] as string[])).filter(name => name.startsWith('delivery-'));
    const deliver = async (coverOnly = false): Promise<RunSpec> => {
      specs.length = 0;
      const before = new Set(await deliveryStages());
      await runtime.invoke('agents.generateVideoDelivery', { id: project.id, format: 'youtube', ...(coverOnly ? { coverOnly: true } : {}), confirm: true });
      const spec = specs[0]!;
      assert.ok(spec.onSuccess);
      const [created] = (await deliveryStages()).filter(name => !before.has(name));
      await copyFile('public/icon.png', join(project.path, '.studio-context', created!, 'cover.png'));
      return spec;
    };
    const deliverOnSuccess = async (): Promise<(signal: AbortSignal) => Promise<unknown>> => {
      const spec = await deliver();
      assert.match(spec.title, /Codex ImageGen capa \+ legenda/);
      return spec.onSuccess!;
    };
    const signal = () => new AbortController().signal;
    const copyFile_ = join(project.path, 'delivery', 'copy-youtube.txt');
    const published = () => readFile(copyFile_, 'utf8');

    await assert.rejects(runtime.invoke('agents.generateVideoDelivery', { id: project.id, format: 'youtube' }), /confirmação explícita/);

    // Both models fail: the paid cover is kept and the error names each model; nothing is published.
    behavior.claude = 'nothing'; behavior.codex = 'nothing';
    let onSuccess = await deliverOnSuccess();
    await assert.rejects(onSuccess(signal()), /Capa salva em delivery\/cover-youtube\.png.*Claude claude-opus-5-5.*Codex gpt-6-luna/s);
    assert.ok((await readFile(join(project.path, 'delivery', 'cover-youtube.png'))).length > 0);
    await assert.rejects(published(), { code: 'ENOENT' });
    assert.deepEqual(asked, ['claude:claude-opus-5-5', 'codex:gpt-6-luna']);

    // Opus works: it writes the caption and Luna is never asked.
    asked.length = 0; behavior.claude = 'caption';
    onSuccess = await deliverOnSuccess();
    assert.match(await onSuccess(signal()) as string, /^Copy e capa geradas e verificadas/);
    assert.deepEqual(asked, ['claude:claude-opus-5-5']);
    assert.equal(await published(), CAPTION);

    // Opus fails (account limit): Luna writes the caption and the message says so.
    asked.length = 0; behavior.claude = 'crash'; behavior.codex = 'caption';
    await rm(copyFile_);
    onSuccess = await deliverOnSuccess();
    assert.match(await onSuccess(signal()) as string, /escrita pelo Codex gpt-6-luna/);
    assert.deepEqual(asked, ['claude:claude-opus-5-5', 'codex:gpt-6-luna']);
    assert.equal(await published(), CAPTION);

    // A caption without exactly 5 hashtags is never published, even when the model says it finished: the next model gets the job.
    asked.length = 0; behavior.claude = 'no-hashtags'; behavior.codex = 'caption';
    await rm(copyFile_);
    onSuccess = await deliverOnSuccess();
    await onSuccess(signal());
    assert.deepEqual(asked, ['claude:claude-opus-5-5', 'codex:gpt-6-luna']);
    assert.equal(await published(), CAPTION);
    asked.length = 0; behavior.claude = 'no-hashtags'; behavior.codex = 'nothing';
    await rm(copyFile_);
    onSuccess = await deliverOnSuccess();
    await assert.rejects(onSuccess(signal()), /5 hashtags/);
    await assert.rejects(published(), { code: 'ENOENT' });

    const detail = await runtime.invoke('projects.detail', { id: project.id }) as ProjectDetail;
    const cover = detail.assets.find(asset => asset.name === 'delivery/cover-youtube.png');
    assert.ok(cover);
    await runtime.invoke('projects.approve', { id: project.id, path: cover.path, approved: true });
    const snapshot = await runtime.invoke('app.snapshot') as { projects: Project[] };
    assert.match(snapshot.projects[0]!.coverUrl!, /^media:\/\/asset\//);

    // Caption-only: Opus first; when its job fails, a second job runs with Luna. The cover is untouched.
    const coverBefore = await readFile(join(project.path, 'delivery', 'cover-youtube.png'));
    specs.length = 0;
    await runtime.invoke('agents.generateVideoCopy', { id: project.id, format: 'youtube', confirm: true });
    await runsReach(2);
    assert.equal(specs.length, 2, 'o plano B inicia quando o primeiro job falha');
    assert.equal(specs[0]!.executable, claude);
    assert.equal(specs[0]!.args[specs[0]!.args.indexOf('--model') + 1], 'claude-opus-5-5');
    assert.equal(specs[1]!.executable, codex);
    assert.equal(specs[1]!.args[specs[1]!.args.indexOf('--model') + 1], 'gpt-6-luna');
    await assert.rejects(specs[1]!.onSuccess!(signal()));
    await writeFile(copyTarget(specs[1]!.args), CAPTION);
    assert.match(await specs[1]!.onSuccess!(signal()) as string, /Codex gpt-6-luna.*Claude claude-opus-5-5 não conseguiu/);
    assert.equal(await published(), CAPTION);
    assert.deepEqual(await readFile(join(project.path, 'delivery', 'cover-youtube.png')), coverBefore);

    // Cover-only never calls a text writer and succeeds with the cover alone.
    asked.length = 0;
    const coverSpec = await deliver(true);
    assert.match(coverSpec.title, /^Codex ImageGen capa ·/);
    assert.match(await coverSpec.onSuccess!(signal()) as string, /^Capa gerada/);
    assert.deepEqual(asked, []);
  } finally { await runtime.dispose(); await rm(root, { recursive: true, force: true }); }
});
