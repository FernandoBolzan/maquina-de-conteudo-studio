import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyArtText, onScreenItems, onScreenText, validateStoryboardScenes, validateVisualTextPages, visualTextPageIssues, VISUAL_TEXT_LIMITS } from '../src/shared/visual-text.js';

function validPage(page: number) {
  return { page, headline: 'Dez dicas simples', copy: 'Texto da página.', depictedPerson: 'none' };
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

test('troca headline e copy no arquivo de arte e preserva o resto do texto', () => {
  const art = 'Título: Sono\nCopy: Sono importa para a memória.\nRegra: sem pessoas.';
  const result = applyArtText(art, { headline: 'Sono', copy: 'Sono importa para a memória.' }, { headline: 'Dormir bem', copy: 'Dormir ajuda a memória.' });
  assert.deepEqual(result.missing, []);
  assert.equal(result.text, 'Título: Dormir bem\nCopy: Dormir ajuda a memória.\nRegra: sem pessoas.');
});

test('headline que aparece dentro da copy nova não corrompe a copy', () => {
  const art = 'Título: Sono\nCopy: Sono é importante.';
  const result = applyArtText(art, { headline: 'Sono', copy: 'Sono é importante.' }, { headline: 'Dormir', copy: 'Sono é importante hoje.' });
  assert.deepEqual(result.missing, []);
  assert.equal(result.text, 'Título: Dormir\nCopy: Sono é importante hoje.');
});

test('texto anterior ausente do arquivo de arte não é trocado e fica reportado', () => {
  const art = 'Título: Sono\nCopy: outro texto.';
  const result = applyArtText(art, { headline: 'Sono', copy: 'Texto que não está no arquivo.' }, { headline: 'Dormir', copy: 'Novo texto.' });
  assert.deepEqual(result.missing, ['copy']);
  assert.equal(result.text, art);
});
