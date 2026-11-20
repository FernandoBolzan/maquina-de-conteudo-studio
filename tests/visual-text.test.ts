import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyArtText, CAPTION_HASHTAG_ERROR, CAPTION_HASHTAG_RULE, CAPTION_MIRROR_LABEL, captionHashtagIssue, captionMirror, onScreenItems, onScreenText, validateStoryboardScenes, validateVisualTextPages, visualTextPageIssues, VISUAL_TEXT_LIMITS } from '../src/shared/visual-text.js';
import { removeDashes } from '../src/shared/writing-style.js';

function validPage(page: number) {
  return { page, headline: 'Dez dicas simples', body: 'Resumo curto na arte.', copy: 'Texto da página.\n\n#tema #assunto #dicas #conteudo #social', depictedPerson: 'none' };
}

test('página sem headline é bloqueada com mensagem em português', () => {
  const issues = visualTextPageIssues({ ...validPage(1), headline: '   ' });
  assert.deepEqual(issues.errors.map(issue => issue.message), ['Informe a headline.']);
});

test('headline fora de 2 a 6 palavras é salva com aviso, não bloqueio', () => {
  const issues = visualTextPageIssues({ ...validPage(1), headline: 'Uma' });
  assert.equal(issues.errors.length, 0);
  assert.equal(issues.warnings.length, 1);
  assert.equal(issues.warnings[0].field, 'headline');
});

test('copy acima do limite é bloqueada', () => {
  const issues = visualTextPageIssues({ ...validPage(1), copy: 'x'.repeat(VISUAL_TEXT_LIMITS.copy + 1) });
  assert.equal(issues.errors[0].field, 'copy');
});
test('subtítulo acima do limite é bloqueado', () => {
  const issues = visualTextPageIssues({ ...validPage(1), body: 'x'.repeat(VISUAL_TEXT_LIMITS.body + 1) });
  assert.equal(issues.errors[0].field, 'body');
});

test('quem aparece aceita as três opções do app e recusa valor fora da lista', () => {
  for (const depictedPerson of ['none', 'other_person', 'client_portrait']) {
    assert.equal(visualTextPageIssues({ ...validPage(1), depictedPerson }).errors.length, 0, depictedPerson);
  }
  assert.equal(visualTextPageIssues({ ...validPage(1), depictedPerson: 'someone' }).errors[0].field, 'depictedPerson');
});

test('lote com número de páginas diferente do projeto é recusado', () => {
  const result = validateVisualTextPages([validPage(1)], 2);
  assert.ok(result.errors.length > 0);
});

test('página fora da ordem ou com número errado é recusada com o número da página', () => {
  const result = validateVisualTextPages([validPage(1), validPage(3)], 2);
  assert.ok(result.errors.some(message => message.startsWith('Página 2:')));
});

test('lote válido não retorna erros', () => {
  const result = validateVisualTextPages([validPage(1), validPage(2)], 2);
  assert.deepEqual(result.errors, []);
});

test('texto na tela vira uma linha por item e volta igual ao ler', () => {
  const items = onScreenItems('  Um ponto  \n\nOutro ponto\r\n');
  assert.deepEqual(items, ['Um ponto', 'Outro ponto']);
  assert.equal(onScreenText(items), 'Um ponto\nOutro ponto');
});

test('cena inexistente ou repetida é recusada', () => {
  const unknown = validateStoryboardScenes([{ id: 'nova', onScreen: 'x' }], ['cena-1']);
  assert.ok(unknown.errors.length > 0);
  const repeated = validateStoryboardScenes([{ id: 'cena-1', onScreen: 'a' }, { id: 'cena-1', onScreen: 'b' }], ['cena-1']);
  assert.ok(repeated.errors.some(message => message.includes('repetidas')));
});

test('texto na tela acima de 300 caracteres é recusado com o id da cena', () => {
  const result = validateStoryboardScenes([{ id: 'cena-1', onScreen: 'x'.repeat(VISUAL_TEXT_LIMITS.onScreen + 1) }], ['cena-1']);
  assert.ok(result.errors[0].startsWith('Cena cena-1:'));
});

test('editar a arte e a legenda atualiza campos distintos, sem imprimir copy na imagem', () => {
  const art = [
    '## Texto na arte',
    'Headline: Sono',
    'Body: Resumo sobre sono.',
    '',
    '## Composição',
    'Use um ícone de lua.',
    '',
    '## Copy para publicação/legenda, NÃO imprimir na arte:',
    'Sono importa para a memória.',
  ].join('\n');
  const result = applyArtText(art, { headline: 'Sono', body: 'Resumo sobre sono.', copy: 'Sono importa para a memória.' }, { headline: 'Dormir bem', body: 'Resumo do descanso.', copy: 'Dormir ajuda a memória.' });
  assert.deepEqual(result.missing, []);
  assert.equal(captionMirror(result.text), 'Dormir ajuda a memória.');
  assert.match(result.text, /Headline: Dormir bem/);
  assert.match(result.text, /Body: Resumo do descanso\./);
  assert.match(result.text, /Use um ícone de lua\./);
  assert.doesNotMatch(result.text.slice(0, result.text.indexOf('## Copy para publicação')), /Dormir ajuda a memória/);
});

test('headline repetida na legenda não altera a copy ao editar campos de arte', () => {
  const art = '## Texto na arte\nHeadline: Sono\nBody: Uma pausa melhora a atenção.\n\n## Composição\nLua\n\n## Copy para publicação/legenda, NÃO imprimir na arte:\nSono é importante.';
  const result = applyArtText(art, { headline: 'Sono', body: 'Uma pausa melhora a atenção.', copy: 'Sono é importante.' }, { headline: 'Dormir', body: 'Uma pausa melhora o foco.', copy: 'Sono é importante hoje.' });
  assert.deepEqual(result.missing, []);
  assert.equal(captionMirror(result.text), 'Sono é importante hoje.');
  assert.match(result.text, /Headline: Dormir/);
});

test('texto anterior ausente do arquivo de arte não é trocado e fica reportado', () => {
  const art = '## Texto na arte\nHeadline: Sono\nBody: Resumo.\n\n## Composição\nLua\n\n## Copy para publicação/legenda, NÃO imprimir na arte:\nOutra copy.';
  const result = applyArtText(art, { headline: 'Sono', body: 'Resumo.', copy: 'Texto que não está no arquivo.' }, { headline: 'Dormir', body: 'Novo resumo.', copy: 'Nova copy.' });
  assert.deepEqual(result.missing, ['copy']);
  assert.equal(result.text, art);
});

test('o rótulo da copy de legenda sobrevive ao filtro de travessões enviado aos agentes', () => {
  assert.equal(removeDashes(CAPTION_MIRROR_LABEL), CAPTION_MIRROR_LABEL);
  assert.equal(captionMirror(`## ${removeDashes(CAPTION_MIRROR_LABEL)}\nCopy integral.\n`), 'Copy integral.');
});

test('linhas POSTNOW_ depois da copy não entram na copy de legenda', () => {
  const prompt = `## Texto na arte\nHeadline: Sono\n\n## ${CAPTION_MIRROR_LABEL}\nCopy integral.\n\nPOSTNOW_COPY_RENDERING=generated_in_image\n`;
  assert.equal(captionMirror(prompt), 'Copy integral.');
});

test('toda legenda termina com uma última linha de exatamente 5 hashtags diferentes', () => {
  const ok = (copy: string) => assert.equal(captionHashtagIssue(copy), undefined, copy);
  const bad = (copy: string) => assert.equal(captionHashtagIssue(copy), CAPTION_HASHTAG_ERROR, copy);
  ok('Texto.\n\n#um #dois #tres #quatro #cinco');
  ok('Texto.\n#ação #educação #IA #dica_rápida #2026\n');
  ok('#um #dois #tres #quatro #cinco');
  bad('Texto sem hashtags.');
  bad('Texto.\n\n#um #dois #tres #quatro');
  bad('Texto.\n\n#um #dois #tres #quatro #cinco #seis');
  bad('Texto.\n\n#um #dois #tres #quatro #UM');
  bad('Texto.\n\n#um #dois #tres #quatro #cinco\nObrigado!');
  bad('Texto com #hashtag no meio.\n\n#um #dois #tres #quatro');
  bad('Texto.\n\n#um #dois #tres #quatro cinco');
  bad('Texto.\n\n# #um #dois #tres #quatro');
  assert.ok(visualTextPageIssues({ ...validPage(1), copy: 'Só texto.' }).errors.some(issue => issue.field === 'copy' && issue.message === CAPTION_HASHTAG_ERROR));
  assert.equal(visualTextPageIssues(validPage(1)).errors.length, 0);
  assert.match(CAPTION_HASHTAG_RULE, /exatamente 5 hashtags/);
});
