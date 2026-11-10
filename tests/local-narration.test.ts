import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generateLocalNarration } from '../src/main/local-narration.js';

test('local narration requires a model and its adjacent configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'piper-model-test-'));
  try {
    const modelPath = join(dir, 'voice.onnx');
    const options = { text: 'Olá', modelPath, outputPath: join(dir, 'output.wav') };
    await assert.rejects(generateLocalNarration(options), /Modelo Piper não encontrado/);
    await writeFile(modelPath, 'model');
    await assert.rejects(generateLocalNarration(options), /Configuração da voz Piper/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('local narration sends text via stdin and never overwrites existing output', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'piper-process-test-'));
  const originalPath = process.env.PATH;
  const originalCapture = process.env.PIPER_TEST_CAPTURE;
  try {
    const modelPath = join(dir, 'voice.onnx');
    const outputPath = join(dir, 'output.wav');
    const capturePath = join(dir, 'stdin.txt');
    await writeFile(modelPath, 'model');
    await writeFile(`${modelPath}.json`, '{}');
    await writeFile(join(dir, 'piper'), `#!${process.execPath}\nconst fs = require('node:fs');\nconst input = fs.readFileSync(0, 'utf8');\nfs.writeFileSync(process.env.PIPER_TEST_CAPTURE, input);\nconst wav = Buffer.alloc(48);\nwav.write('RIFF', 0); wav.write('WAVE', 8);\nfs.writeFileSync(process.argv[process.argv.indexOf('--output_file') + 1], wav);\n`, { mode: 0o755 });
    process.env.PATH = dir;
    process.env.PIPER_TEST_CAPTURE = capturePath;
    await generateLocalNarration({ text: 'Olá\nmundo', modelPath, outputPath });
    assert.equal(await readFile(capturePath, 'utf8'), 'Olá mundo\n');
    const original = await readFile(outputPath);
    await assert.rejects(generateLocalNarration({ text: 'Outra', modelPath, outputPath }), /caminho novo/);
    assert.deepEqual(await readFile(outputPath), original);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    if (originalCapture === undefined) delete process.env.PIPER_TEST_CAPTURE; else process.env.PIPER_TEST_CAPTURE = originalCapture;
    await rm(dir, { recursive: true, force: true });
  }
});
