import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretAgentLine } from '../src/shared/agent-events.js';

test('ignores lines that are not JSON objects', () => {
  assert.equal(interpretAgentLine('codex', ''), undefined);
  assert.equal(interpretAgentLine('claude', '   '), undefined);
  assert.equal(interpretAgentLine('codex', 'plain text'), undefined);
  assert.equal(interpretAgentLine('claude', '[1,2,3]'), undefined);
  assert.equal(interpretAgentLine('claude', '\u001b[32mnot json\u001b[0m'), undefined);
});

test('unknown event types produce neither activity nor transcript', () => {
  assert.deepEqual(interpretAgentLine('codex', JSON.stringify({ type: 'turn.started' })), {});
  assert.deepEqual(interpretAgentLine('claude', JSON.stringify({ type: 'rate_limit_event' })), {});
});

test('cuts long activity text to 120 characters with an ellipsis', () => {
  const query = 'x'.repeat(300);
  const result = interpretAgentLine('claude', JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'WebSearch', input: { query } }] },
  }));
  assert.ok(result?.activity);
  assert.equal(result.activity.text.length, 120);
  assert.ok(result.activity.text.endsWith('…'));
});

test('shows the host of a web fetch instead of the full URL', () => {
  const result = interpretAgentLine('claude', JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'WebFetch', input: { url: 'https://exemplo.com/a/b?c=d' } }] },
  }));
  assert.deepEqual(result?.activity, { kind: 'web', text: 'Consultando um site: exemplo.com' });
});

test('labels a curl shell command by its host', () => {
  const command = "/bin/bash -lc 'curl -s https://exemplo.com/pagina'";
  const result = interpretAgentLine('codex', JSON.stringify({
    type: 'item.started',
    item: { type: 'command_execution', command, status: 'in_progress', exit_code: null },
  }));
  assert.deepEqual(result?.activity, { kind: 'web', text: 'Consultando um site: exemplo.com' });
});

test('reports a Claude result flagged as error as an error activity with its text', () => {
  const result = interpretAgentLine('claude', JSON.stringify({ type: 'result', is_error: true, result: 'Falha ao gerar' }));
  assert.equal(result?.activity?.kind, 'error');
  assert.ok(result?.transcript?.includes('Falha ao gerar'));
});

test('keeps the agent message text in the transcript', () => {
  const result = interpretAgentLine('codex', JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', text: 'Pronto. Arquivos atualizados.' },
  }));
  assert.equal(result?.transcript, 'Pronto. Arquivos atualizados.');
  assert.equal(result?.activity, undefined);
});

test('labels a Claude write of a generated png as an image', () => {
  const result = interpretAgentLine('claude', JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/projeto/generated/capa.png' } }] },
  }));
  assert.deepEqual(result?.activity, { kind: 'image', text: 'Imagem salva: capa.png' });
});

test('names the failed command after its exit code, cut to the activity limit', () => {
  const command = `/bin/bash -lc 'git -C /repo ${'--verbose '.repeat(30)}status'`;
  const result = interpretAgentLine('codex', JSON.stringify({
    type: 'item.completed',
    item: { type: 'command_execution', command, status: 'failed', exit_code: 128 },
  }));
  assert.ok(result?.activity);
  assert.equal(result.activity.kind, 'error');
  assert.ok(result.activity.text.includes('código 128'));
  assert.ok(result.activity.text.includes('git -C /repo --verbose'));
  assert.ok(!result.activity.text.includes('/bin/bash'));
  assert.ok(result.activity.text.length <= 120);
  assert.ok(result.activity.text.endsWith('…'));
});

test('reports a failed command with no text by its exit code alone', () => {
  const result = interpretAgentLine('codex', JSON.stringify({
    type: 'item.completed',
    item: { type: 'command_execution', status: 'failed', exit_code: 1 },
  }));
  assert.ok(result?.activity);
  assert.equal(result.activity.kind, 'error');
  assert.ok(result.activity.text.includes('código 1'));
  assert.ok(!result.activity.text.includes('undefined'));
});
