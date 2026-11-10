import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGENT_RULES, agentAskedQuestions, composeAgentFollowUp, formatAgentAnswers, lastAgentMessage, parseAgentQuestions, withAgentRules } from '../src/shared/agent-followup.js';

test('withAgentRules appends the rules after a blank line and is idempotent', () => {
  const once = withAgentRules('  Escreva um roteiro.  ');
  assert.equal(once, `Escreva um roteiro.\n\n${AGENT_RULES}`);
  assert.equal(withAgentRules(once), once);
});

test('lastAgentMessage strips ANSI sequences and returns plain text', () => {
  const log = '\u001b[32mOlá\u001b[0m mundo\n';
  assert.equal(lastAgentMessage(log), 'Olá mundo');
});

test('lastAgentMessage keeps the tail starting at a line boundary within maxChars', () => {
  const log = 'linha um\nlinha dois\nlinha três';
  assert.equal(lastAgentMessage(log, 15), 'linha três');
  assert.equal(lastAgentMessage(log, 40), log);
});

test('lastAgentMessage returns an empty string for blank input', () => {
  assert.equal(lastAgentMessage(''), '');
  assert.equal(lastAgentMessage('  \n\t \n'), '');
});

test('composeAgentFollowUp orders the original prompt, previous message and answer', () => {
  const text = composeAgentFollowUp({ originalPrompt: 'PROMPT_ORIG', previousMessage: 'MSG_ANT', answer: 'RESP_USR' });
  const a = text.indexOf('PROMPT_ORIG');
  const b = text.indexOf('MSG_ANT');
  const c = text.indexOf('RESP_USR');
  assert.ok(a >= 0 && a < b && b < c);
  assert.equal(text.split(AGENT_RULES).length - 1, 1);
});

test('composeAgentFollowUp rejects an empty answer', () => {
  assert.throws(
    () => composeAgentFollowUp({ originalPrompt: 'p', previousMessage: 'm', answer: '   ' }),
    { message: 'Escreva a resposta antes de enviar.' },
  );
});

test('agentAskedQuestions is true only when the last questions section lists questions', () => {
  assert.equal(agentAskedQuestions('Briefing pronto.\n\n## Perguntas para o usuário\n1. Qual é o público?'), true);
  assert.equal(agentAskedQuestions('Briefing pronto.\n\nPerguntas para o usuário:\nSem perguntas.'), false);
  assert.equal(agentAskedQuestions('Sem seção alguma.'), false);
  assert.equal(agentAskedQuestions('Texto.\n## Perguntas para o usuário\n1. Antiga?\nTexto final.\n## Perguntas para o usuário\nSem perguntas.'), false);
});

test('parseAgentQuestions reads numbered questions and their checkbox options', () => {
  const message = [
    'Pronto.',
    '## Perguntas para o usuário',
    '1. O vídeo fica com 30 s ou 35 s?',
    '- [ ] 30 s',
    '- [ ] 35 s',
    '2. Qual tom usar',
    'na abertura?',
  ].join('\n');
  assert.deepEqual(parseAgentQuestions(message), [
    { text: 'O vídeo fica com 30 s ou 35 s?', options: ['30 s', '35 s'] },
    { text: 'Qual tom usar na abertura?', options: [] },
  ]);
});

test('parseAgentQuestions accepts checked and plain option bullets for yes/no questions', () => {
  const message = [
    'Perguntas para o usuário',
    '1. Manter o logo na capa?',
    '- [x] Sim',
    '- Não',
  ].join('\n');
  assert.deepEqual(parseAgentQuestions(message), [
    { text: 'Manter o logo na capa?', options: ['Sim', 'Não'] },
  ]);
});

test('formatAgentAnswers requires an option or text for every question', () => {
  const questions = [{ text: 'Duração?', options: ['30 s'] }, { text: 'Tom?', options: [] }];
  assert.throws(
    () => formatAgentAnswers(questions, [{ selected: ['30 s'], text: '' }, { selected: [], text: '  ' }]),
    { message: 'Responda todas as perguntas antes de enviar.' },
  );
  assert.equal(
    formatAgentAnswers(questions, [{ selected: ['30 s'], text: 'curto' }, { selected: [], text: 'Calmo' }]),
    '1. Duração?\nResposta: 30 s; curto\n\n2. Tom?\nResposta: Calmo',
  );
});
