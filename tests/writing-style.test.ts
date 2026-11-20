import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { Runtime } from '../src/main/runtime.js';
import type { Job, Project } from '../src/shared/contracts.js';
import { PROMPT_RECIPES, composePrompt } from '../src/shared/prompt-library.js';
import { personVarietyRule } from '../src/shared/pose-variety.js';
import { validateVisualTextPages, onScreenError } from '../src/shared/visual-text.js';
import { WRITING_STYLE_RULE, hasDash, removeDashes, storyboardDashIssues } from '../src/shared/writing-style.js';

const EM = '\u2014';
const EN = '\u2013';

test('removeDashes turns every long and medium dash into plain punctuation without touching hyphens', () => {
  assert.equal(removeDashes(`A guarda ${EM} e o convívio ${EM} são temas diferentes.`), 'A guarda, e o convívio, são temas diferentes.');
  assert.equal(removeDashes(`Monte 4${EN}6 cenas e 10 ${EM} 12 posts`), 'Monte 4 a 6 cenas e 10 a 12 posts');
  assert.equal(removeDashes(`${EM} primeiro item\n${EN} segundo item`), 'primeiro item\nsegundo item');
  assert.equal(removeDashes(`capa ${EM} X; fechamento${EM}Y`), 'capa, X; fechamento, Y');
  assert.equal(removeDashes(`Fim.${EM} Depois`), 'Fim. Depois');
  assert.equal(removeDashes('guarda-chuva e arquivo-fonte-01.png'), 'guarda-chuva e arquivo-fonte-01.png');
  for (const input of [`a ${EM} b`, `${EN}`, `${EM}${EM}${EM}`, `x${EM}`, `\u2015 y`]) assert.equal(hasDash(removeDashes(input)), false, input);
});

test('the writing rule forbids the dash and AI-sounding patterns without containing the characters itself', () => {
  assert.equal(hasDash(WRITING_STYLE_RULE), false);
  assert.equal(removeDashes(WRITING_STYLE_RULE), WRITING_STYLE_RULE);
  assert.match(WRITING_STYLE_RULE, /nunca use travessão/);
  assert.match(WRITING_STYLE_RULE, /não é X, é Y/);
});

test('every library prompt and Studio rule reaches the agent free of dashes', () => {
  const input = { topic: 'guarda compartilhada', audience: 'pais', tone: 'claro', callToAction: 'salve' };
  for (const recipe of PROMPT_RECIPES) {
    const formats = recipe.kind === 'image' ? ['carousel-4x5', 'post-1x1', 'story-9x16'] as const : ['reels'] as const;
    for (const format of formats) assert.equal(hasDash(composePrompt(recipe, { ...input, format, pageCount: 5 })), false, `${recipe.id} ${format}`);
    assert.equal(hasDash(recipe.visualDirection ?? ''), false, recipe.id);
  }
  assert.equal(hasDash(personVarietyRule('7f89b62e-3dd2-41ff-a5a1-58117038d631')), false);
});

test('text the person edits is refused when it carries a dash', () => {
  const page = { page: 1, headline: 'Guarda e convivência', body: 'Resumo simples.', copy: 'Texto simples.', depictedPerson: 'none' };
  assert.deepEqual(validateVisualTextPages([page], 1).errors, []);
  assert.match(validateVisualTextPages([{ ...page, headline: `Guarda ${EM} convivência` }], 1).errors.join(' '), /Página 1: Reescreva sem travessão/);
  assert.match(validateVisualTextPages([{ ...page, copy: `Texto ${EN} com dash.` }], 1).errors.join(' '), /Página 1: Reescreva sem travessão/);
  assert.equal(onScreenError('Antes\nDepois'), undefined);
  assert.match(onScreenError(`Antes ${EM} depois`) ?? '', /sem travessão/);
});

test('video storyboards report the narrated and on-screen text that carries a dash', () => {
  const storyboard = { scenes: [
    { id: 'scene-1', narration: 'Seus filhos estão contra você?', onScreen: ['SEUS FILHOS'], audio: { spokenText: 'Seus filhos estão contra você?' } },
    { id: 'scene-2', title: `Título ${EM} livre`, narration: `Escute ${EM} sem acusar.`, onScreen: ['ANTES', `DEPOIS ${EN} SEMPRE`], audio: { spokenText: `Escute ${EM} sem acusar.` } },
  ] };
  assert.deepEqual(storyboardDashIssues(storyboard).map(issue => issue.split('. ')[0]), [
    'Cena scene-2: a narração tem travessão', 'Cena scene-2: o texto falado tem travessão', 'Cena scene-2: o texto na tela tem travessão',
  ]);
  assert.deepEqual(storyboardDashIssues({ scenes: 'nada' }), []);
  assert.deepEqual(storyboardDashIssues(null), []);
});

async function withRuntime(run: (runtime: Runtime, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'mdc-writing-style-'));
  const dataDir = join(root, 'data');
  const codex = join(dataDir, 'runtime', 'tools', 'codex', 'node_modules', '.bin', 'codex');
  const runtime = new Runtime(dataDir, {
    assetPrefix: 'media://asset/', secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('unavailable'); }, decryptSecret: () => { throw new Error('unavailable'); },
    pickFile: async () => undefined, openPath: async () => undefined, openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'indisponível' }),
  }, () => undefined);
  try {
    await mkdir(dirname(codex), { recursive: true });
    await writeFile(codex, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    await chmod(codex, 0o700);
    await runtime.init();
    await runtime.invoke('app.settings', { workspace: join(root, 'workspace') });
    await run(runtime, root);
  } finally {
    await runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

test('whatever prompt, title or brief the person writes, the agent context has no dash and the saved request keeps the writing rule', () => withRuntime(async (runtime, root) => {
  const fakeJob: Job = { id: 'fake-codex-job', title: 'Codex em teste', status: 'running', createdAt: new Date().toISOString(), log: '', interactive: false };
  runtime.services.run = async spec => ({ ...fakeJob, title: spec.title });
  runtime.services.waitJob = async id => ({ ...fakeJob, id, status: 'failed' });
  runtime.services.capture = async () => ({ code: 1, stdout: '', stderr: 'Maestro isolado neste teste.' });

  const project = await runtime.invoke('projects.create', { title: `Carrossel ${EM} Guarda ${EN} direitos`, kind: 'image', brief: `Tema: pai ${EM} filho ${EN} rotina.` }) as Project;
  await runtime.invoke('agents.start', { id: project.id, provider: 'codex', prompt: `Escreva ${EM} em tom leve ${EM} um carrossel de 4${EN}6 slides. Exemplo: “não é só guarda, é rotina”.`, confirm: true });
  const dir = join(project.path, '.studio-context');
  const [file] = (await readdir(dir)).filter(name => name.endsWith('.txt'));
  const context = await readFile(join(dir, file!), 'utf8');
  assert.equal(hasDash(context), false);
  assert.ok(context.includes('ESTILO DE ESCRITA, obrigatório'));
  const sessions = await readdir(join(root, 'workspace', '.studio', 'sessions'));
  const session = JSON.parse(await readFile(join(root, 'workspace', '.studio', 'sessions', sessions[0]!, 'session.json'), 'utf8')) as { requestPath: string };
  const request = await readFile(session.requestPath, 'utf8');
  assert.equal(hasDash(request), true, 'a sessão preserva a entrada original para auditoria');
  assert.ok(context.includes('Escreva, em tom leve, um carrossel de 4 a 6 slides.'));
  assert.ok(context.includes('Carrossel, Guarda, direitos'));
}));
