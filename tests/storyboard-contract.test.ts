import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Project } from '../src/shared/contracts.js';
import { storyboard } from '../src/main/content/native.js';
import { storyboardContractIssues } from '../src/shared/storyboard-contract.js';

type Doc = Record<string, unknown>;

function project(): Project {
  return {
    id: 'projeto-1',
    title: 'Processo de divórcio',
    kind: 'video',
    createdAt: '2026-11-01T00:00:00.000Z',
    path: '/tmp/processo-de-divorcio',
    brief: 'Explicar o processo em três passos.',
    format: 'reels',
  };
}

/** Storyboard que o próprio app gera com uma imagem: ponto de partida válido para cada caso. */
function validDoc(): Doc {
  return storyboard(project(), ['assets/visuals/generated/cena-1.png']);
}

function sceneOf(doc: Doc): Doc {
  return (doc.scenes as Doc[])[0] as Doc;
}

function visualOf(doc: Doc): Doc {
  return sceneOf(doc).visual as Doc;
}

function audioOf(doc: Doc): Doc {
  return sceneOf(doc).audio as Doc;
}

function issuesAfter(mutate: (doc: Doc) => void): string[] {
  const doc = validDoc();
  mutate(doc);
  return storyboardContractIssues(doc);
}

function assertRejectedAt(issues: string[], path: string): void {
  assert.ok(
    issues.some(issue => issue.startsWith(`${path}:`)),
    `esperado erro em ${path}; recebido ${JSON.stringify(issues)}`,
  );
}

test('rascunho gerado pelo app passa no contrato VideoGo', () => {
  assert.deepEqual(storyboardContractIssues(storyboard(project())), []);
});

test('storyboard com imagens do PostNow passa no contrato VideoGo', () => {
  const doc = storyboard(project(), ['assets/visuals/generated/cena-1.png', 'assets/visuals/generated/cena-2.png']);
  assert.deepEqual(storyboardContractIssues(doc), []);
});
test('storyboard com sourceScenes derivadas preenche textos e passa no contrato VideoGo', () => {
  const doc = storyboard(project(), ['assets/visuals/generated/cena-1.png', 'assets/visuals/generated/cena-2.png'], [
    { title: 'Me separei. E agora?', narration: 'Me separei. E agora? Respire fundo.', spokenText: 'Me separei. E agora? Respire fundo.', onScreen: ['Me separei. E agora?'] },
    { title: 'Dá para ir ao cartório?', narration: 'Com acordo, o divórcio pode ser em cartório.', spokenText: 'Com acordo, o divórcio pode ser em cartório.', onScreen: ['Dá para ir ao cartório?'] },
  ]);
  const scenes = doc.scenes as Doc[];
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0]?.title, 'Me separei. E agora?');
  assert.equal(scenes[0]?.narration, 'Me separei. E agora? Respire fundo.');
  assert.deepEqual((scenes[0]?.audio as Doc)?.spokenText, 'Me separei. E agora? Respire fundo.');
  assert.deepEqual(scenes[0]?.onScreen, ['Me separei. E agora?']);
  assert.deepEqual(storyboardContractIssues(doc), []);
});


test('recusa storyboard ausente ou que não é objeto', () => {
  assert.equal(storyboardContractIssues(undefined).length, 1);
  assert.equal(storyboardContractIssues(['storyboard']).length, 1);
});

test('rejeita chave desconhecida na raiz, na cena, no visual e no áudio', () => {
  assertRejectedAt(issuesAfter(doc => { doc.extra = true; }), 'extra');
  assertRejectedAt(issuesAfter(doc => { sceneOf(doc).extra = true; }), 'scenes[0].extra');
  assertRejectedAt(issuesAfter(doc => { visualOf(doc).extra = true; }), 'scenes[0].visual.extra');
  assertRejectedAt(issuesAfter(doc => { audioOf(doc).extra = true; }), 'scenes[0].audio.extra');
});

test('rejeita schema diferente de videogo.storyboard/v1', () => {
  assertRejectedAt(issuesAfter(doc => { doc.schema = 'videogo.storyboard/v0'; }), 'schema');
});

test('rejeita id fora do padrão minúsculas com hífen, na raiz e na cena', () => {
  assertRejectedAt(issuesAfter(doc => { doc.id = 'Projeto Teste'; }), 'id');
  assertRejectedAt(issuesAfter(doc => { sceneOf(doc).id = 'Cena Um'; }), 'scenes[0].id');
});

test('rejeita id de cena repetido', () => {
  const issues = issuesAfter(doc => {
    (doc.scenes as Doc[]).push({ ...sceneOf(doc) });
  });
  assertRejectedAt(issues, 'scenes[1].id');
});

test('rejeita finalidade de cena fora da lista', () => {
  assertRejectedAt(issuesAfter(doc => { sceneOf(doc).purpose = 'intro'; }), 'scenes[0].purpose');
});

test('exige duração de cena maior que zero e até 900 segundos', () => {
  assertRejectedAt(issuesAfter(doc => { sceneOf(doc).targetSeconds = 0; }), 'scenes[0].targetSeconds');
  assertRejectedAt(issuesAfter(doc => { sceneOf(doc).targetSeconds = 901; }), 'scenes[0].targetSeconds');
  assert.deepEqual(issuesAfter(doc => { sceneOf(doc).targetSeconds = 900; }), []);
});

test('exige fps 30 e estilo do VideoGo ou perfil de marca', () => {
  assertRejectedAt(issuesAfter(doc => { doc.fps = 24; }), 'fps');
  assertRejectedAt(issuesAfter(doc => { doc.style = 'estilo-inexistente'; }), 'style');
  assertRejectedAt(issuesAfter(doc => { doc.style = 'profile:'; }), 'style');
  assert.deepEqual(issuesAfter(doc => { doc.style = 'corporate'; }), []);
  assert.deepEqual(issuesAfter(doc => { doc.style = 'profile:marca-patricia'; }), []);
});

test('exige título, objetivo e público com texto', () => {
  assertRejectedAt(issuesAfter(doc => { doc.title = '   '; }), 'title');
  assertRejectedAt(issuesAfter(doc => { doc.objective = ''; }), 'objective');
  assertRejectedAt(issuesAfter(doc => { doc.audience = '  '; }), 'audience');
});

test('exige entre 1 e 200 cenas', () => {
  assertRejectedAt(issuesAfter(doc => { doc.scenes = []; }), 'scenes');
  assertRejectedAt(
    issuesAfter(doc => {
      const scene = sceneOf(doc);
      doc.scenes = Array.from({ length: 201 }, (_, index) => ({ ...scene, id: `cena-${index}` }));
    }),
    'scenes',
  );
});

test('limita onScreen a 8 linhas não vazias', () => {
  assertRejectedAt(
    issuesAfter(doc => { sceneOf(doc).onScreen = Array.from({ length: 9 }, (_, index) => `Linha ${index}`); }),
    'scenes[0].onScreen',
  );
  assertRejectedAt(issuesAfter(doc => { sceneOf(doc).onScreen = ['   ']; }), 'scenes[0].onScreen[0]');
  assert.deepEqual(
    issuesAfter(doc => { sceneOf(doc).onScreen = Array.from({ length: 8 }, (_, index) => `Linha ${index}`); }),
    [],
  );
});

test('motores 3D exigem compositionId; motion e footage exigem footagePath', () => {
  assertRejectedAt(issuesAfter(doc => { sceneOf(doc).engine = 'remotion-3d'; }), 'scenes[0].visual');
  assert.deepEqual(
    issuesAfter(doc => {
      sceneOf(doc).engine = 'remotion-3d';
      visualOf(doc).compositionId = 'Intro';
    }),
    [],
  );
  assertRejectedAt(issuesAfter(doc => { sceneOf(doc).engine = 'motion'; }), 'scenes[0].visual');
  assertRejectedAt(issuesAfter(doc => { visualOf(doc).kind = 'footage'; }), 'scenes[0].visual');
  assert.deepEqual(
    issuesAfter(doc => {
      visualOf(doc).kind = 'footage';
      visualOf(doc).footagePath = 'assets/footage/selected/cena-1.mp4';
    }),
    [],
  );
});

test('exige saída do recorte maior que a entrada', () => {
  assertRejectedAt(
    issuesAfter(doc => { Object.assign(visualOf(doc), { inPoint: 2, outPoint: 2 }); }),
    'scenes[0].visual.outPoint',
  );
  assert.deepEqual(issuesAfter(doc => { Object.assign(visualOf(doc), { inPoint: 1, outPoint: 3 }); }), []);
});

test('spokenText diz as mesmas palavras da narração; tags, @handle e art. são tratados', () => {
  const spoken = (narration: string, spokenText: string) =>
    issuesAfter(doc => {
      sceneOf(doc).narration = narration;
      audioOf(doc).spokenText = spokenText;
    });
  assertRejectedAt(spoken('Olá, mundo.', 'Oi, planeta.'), 'scenes[0].audio.spokenText');
  assert.deepEqual(spoken('Olá, mundo.', '[calmo] Olá, [pausa] mundo.'), []);
  assert.deepEqual(spoken('Fale com @joao hoje.', 'Fale com arroba joao hoje.'), []);
  assert.deepEqual(spoken('O art. vale.', 'O artigo vale.'), []);
});

test('sfx ancorado no início não pode começar no fim da cena; ancorado no fim é aceito', () => {
  const cue = (at: number, anchor?: 'start' | 'end') =>
    issuesAfter(doc => {
      audioOf(doc).sfxCues = [{ asset: 'assets/audio/sfx/whoosh.wav', at, ...(anchor ? { anchor } : {}) }];
    });
  assertRejectedAt(cue(5), 'scenes[0].audio.sfxCues[0]');
  assertRejectedAt(cue(5, 'start'), 'scenes[0].audio.sfxCues[0]');
  assert.deepEqual(cue(1, 'start'), []);
  assert.deepEqual(cue(1, 'end'), []);
});

test('fontes exigem URL absoluta e data de checagem existente', () => {
  const source = (url: string, checkedAt: string) =>
    issuesAfter(doc => {
      sceneOf(doc).sources = [{ claim: 'Prazo de 30 dias', url, checkedAt }];
    });
  assertRejectedAt(source('https://example.com/lei', '2026-02-29'), 'scenes[0].sources[0].checkedAt');
  assertRejectedAt(source('lei-sem-protocolo', '2026-11-08'), 'scenes[0].sources[0].url');
  assert.deepEqual(source('https://example.com/lei', '2028-02-29'), []);
});
