import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { FIND_FREE_AREA_SCRIPT } from '../src/main/content/conform.js';
import { capture } from '../src/main/supervisor.js';

test('FIND_FREE_AREA_SCRIPT selects clean area when standard bottom-right is noisy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdc-logo-free-'));
  const python = '/home/bolzan/Documentos/Code/PostNow/.venv/bin/python';
  const canvasPath = join(root, 'canvas.png');
  const logoPath = join(root, 'logo.png');

  try {
    // Generate test canvas with noise only in bottom-right
    const setupPy = `
from PIL import Image
img = Image.new('RGB', (1080, 1080), (255, 255, 255))
# Busy illustration/artwork in bottom right
for x in range(750, 1080):
    for y in range(750, 1080):
        img.putpixel((x, y), ((x * 13) % 256, (y * 17) % 256, 128))
img.save('${canvasPath}')
logo = Image.new('RGBA', (180, 100), (0, 0, 0, 255))
logo.save('${logoPath}')
`;
    const gen = await capture(python, ['-c', setupPy]);
    assert.equal(gen.code, 0, gen.stderr);

    const probe = await capture(python, ['-c', FIND_FREE_AREA_SCRIPT, canvasPath, logoPath, '180', '100']);
    assert.equal(probe.code, 0, probe.stderr);

    const coords = JSON.parse(probe.stdout.trim()) as { x: number; y: number };
    // Should NOT be placed in the noisy bottom-right corner (which is x around 824)
    assert.ok(coords.x < 500, `Expected free area on left side (x < 500), got x=${coords.x}`);
    assert.ok(coords.y > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
