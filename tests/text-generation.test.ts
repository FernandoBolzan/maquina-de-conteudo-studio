import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasTextContent, shouldAutoStartTextGeneration } from '../src/shared/text-generation.js';

const emptyPages = [{ headline: '', copy: '' }, { headline: '  ', copy: '' }];
const writtenPages = [{ headline: 'Precisa esperar dois anos?', copy: 'Texto da página.' }];

const newBrief = {
  kind: 'image' as const,
  previousBrief: '',
  nextBrief: 'Curiosidades sobre o divórcio no Brasil',
  pages: emptyPages,
  sessionRunning: false,
};

test('salvar uma pauta nova em projeto de imagem sem texto dispara a geração, inclusive sem páginas ainda', () => {
  assert.equal(shouldAutoStartTextGeneration(newBrief), true);
  assert.equal(shouldAutoStartTextGeneration({ ...newBrief, pages: [] }), true);
});

test('pauta igual à salva ou vazia não dispara a geração', () => {
  assert.equal(shouldAutoStartTextGeneration({ ...newBrief, previousBrief: 'Curiosidades sobre o divórcio no Brasil  ' }), false);
  assert.equal(shouldAutoStartTextGeneration({ ...newBrief, nextBrief: '   ' }), false);
});

test('texto já gravado nas páginas nunca é sobrescrito pela geração automática', () => {
  assert.equal(shouldAutoStartTextGeneration({ ...newBrief, pages: writtenPages }), false);
  assert.equal(shouldAutoStartTextGeneration({ ...newBrief, pages: [{ headline: '', copy: 'Só a copy.' }] }), false);
});

test('projeto de vídeo e sessão já em andamento não disparam a geração', () => {
  assert.equal(shouldAutoStartTextGeneration({ ...newBrief, kind: 'video' }), false);
  assert.equal(shouldAutoStartTextGeneration({ ...newBrief, sessionRunning: true }), false);
});

test('hasTextContent considera qualquer headline ou copy preenchida', () => {
  assert.equal(hasTextContent(emptyPages), false);
  assert.equal(hasTextContent([{ headline: '', copy: '' }, { headline: '', copy: 'Copy' }]), true);
  assert.equal(hasTextContent([]), false);
});
