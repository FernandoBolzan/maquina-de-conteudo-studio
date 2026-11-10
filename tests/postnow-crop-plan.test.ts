import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImageSize, planCenterCrop } from '../src/main/content/conform.js';

const FRAME_1_1 = { width: 1080, height: 1080 };

test('fecha 1140×1080 em 1:1 cortando 30 px de cada lado', () => {
  assert.deepEqual(planCenterCrop({ width: 1140, height: 1080 }, FRAME_1_1), { left: 30, top: 0, width: 1080, height: 1080, cropped: true });
});

test('fecha 1080×1116 em 1:1 cortando 18 px em cima e embaixo', () => {
  assert.deepEqual(planCenterCrop({ width: 1080, height: 1116 }, FRAME_1_1), { left: 0, top: 18, width: 1080, height: 1080, cropped: true });
});

test('não recorta quando a origem já tem o tamanho do alvo', () => {
  assert.deepEqual(planCenterCrop(FRAME_1_1, FRAME_1_1), { left: 0, top: 0, width: 1080, height: 1080, cropped: false });
});

test('aceita o limite exato de 3% por lado e recusa 0,1 ponto acima', () => {
  assert.deepEqual(planCenterCrop({ width: 1148, height: 1080 }, FRAME_1_1), { left: 34, top: 0, width: 1080, height: 1080, cropped: true });
  assert.equal(planCenterCrop({ width: 1149, height: 1080 }, FRAME_1_1), undefined);
});

test('recusa saídas do ImageGen que precisariam de recorte acima do limite', () => {
  assert.equal(planCenterCrop({ width: 1200, height: 1080 }, FRAME_1_1), undefined);
  assert.equal(planCenterCrop({ width: 1024, height: 1536 }, FRAME_1_1), undefined);
  assert.equal(planCenterCrop({ width: 1536, height: 1024 }, FRAME_1_1), undefined);
});

test('aceita quadrado no formato 1:1 sem recorte', () => {
  assert.deepEqual(planCenterCrop({ width: 1254, height: 1254 }, { width: 1080, height: 1080 }), { left: 0, top: 0, width: 1254, height: 1254, cropped: false });
});

test('lê a última linha do probe e recusa tamanho que não é inteiro positivo', () => {
  assert.deepEqual(parseImageSize('aviso\n{"width": 1092, "height": 1440}\n'), { width: 1092, height: 1440 });
  assert.throws(() => parseImageSize('{"width": 0, "height": 1440}'), /tamanho de imagem inválido/);
  assert.throws(() => parseImageSize('{"width": 1092.5, "height": 1440}'), /tamanho de imagem inválido/);
});
