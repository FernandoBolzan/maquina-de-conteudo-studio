import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainTerminalText } from '../src/shared/terminal-text.js';

test('Terminal copy keeps the text and drops styling and cursor sequences', () => {
  assert.equal(plainTerminalText('\u001b[32mok\u001b[0m\r\nlinha 2\rlinha 3\n'), 'ok\nlinha 2\nlinha 3\n');
  assert.equal(plainTerminalText('\u001b[2K\u001b[1Gpronto'), 'pronto');
});
