import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGEGEN_REFERENCE_LIMIT, imageGenerationReferences, isAttachableReference } from '../src/shared/brand-references.js';
import type { BrandReference } from '../src/shared/contracts.js';

const reference = (name: string, path: string, kind: BrandReference['kind'] = 'image'): BrandReference => ({ id: name, name, path, kind, url: path });

test('imageGenerationReferences attaches raster images in brand order, ignoring extension case', () => {
  const { attached, skipped } = imageGenerationReferences([
    reference('a', '/brand/a.PNG'), reference('b', '/brand/b.jpg'), reference('c', '/brand/c.webp'),
  ]);
  assert.deepEqual(attached.map(item => item.name), ['a', 'b', 'c']);
  assert.deepEqual(skipped, []);
});

test('imageGenerationReferences keeps PDFs, documents and unsupported image formats out of the attachments', () => {
  const { attached, skipped } = imageGenerationReferences([
    reference('brandbook', '/brand/brandbook.pdf', 'pdf'),
    reference('guia', '/brand/guia.md', 'document'),
    reference('vetor', '/brand/logo.svg'),
    reference('animado', '/brand/loop.gif'),
    reference('avif', '/brand/foto.avif'),
    reference('foto', '/brand/foto.jpg'),
  ]);
  assert.deepEqual(attached.map(item => item.name), ['foto']);
  assert.deepEqual(skipped.map(item => item.name), ['brandbook', 'guia', 'vetor', 'animado', 'avif']);
});

test('imageGenerationReferences caps attachments at the ImageGen limit and reports the overflow as skipped', () => {
  const refs = Array.from({ length: IMAGEGEN_REFERENCE_LIMIT + 1 }, (_, index) => reference(`ref-${index + 1}`, `/brand/ref-${index + 1}.png`));
  const { attached, skipped } = imageGenerationReferences(refs);
  assert.equal(attached.length, IMAGEGEN_REFERENCE_LIMIT);
  assert.deepEqual(skipped.map(item => item.name), [`ref-${IMAGEGEN_REFERENCE_LIMIT + 1}`]);
});

test('isAttachableReference rejects stored paths without a supported extension', () => {
  assert.equal(isAttachableReference(reference('sem-extensao', '/brand/referencia')), false);
  assert.equal(isAttachableReference(reference('pasta-com-ponto', '/brand.v2/referencia')), false);
});

test('isAttachableReference keeps references with a comma in the path out of --image', () => {
  assert.equal(isAttachableReference(reference('virgula', '/Docs, Projetos/foto.png')), false);
  assert.equal(isAttachableReference(reference('sem-virgula', '/Docs Projetos/foto.png')), true);
});
