import { plainTerminalText } from './terminal-text.js';

export const AGENT_RULES = [
  'Regras para o agente:',
  '- Execute a tarefa até o fim com as ferramentas disponíveis e entregue o resultado, não um plano nem uma pergunta sobre o que fazer.',
  '- Você já tem acesso aos arquivos e comandos desta sessão. Nunca pergunte sobre permissões, acesso, comandos ou arquivos que você mesmo pode ler ou verificar.',
  '- Antes de perguntar qualquer coisa, verifique o estado real: leia os arquivos, liste as pastas e confira o projeto.',
  '- Em dúvida, siga o briefing e decida pelo melhor critério, com lógica, sem perguntar. Registre as decisões tomadas na mensagem final. Pergunte só o essencial: algo que depende da pessoa e que você não consegue resolver sozinho (um arquivo ou dado que só ela tem, ou uma decisão que muda o resultado de forma irreversível). Máximo de uma pergunta. Não faça perguntas interativas no terminal e não espere por entrada do usuário.',
  '- Se houver perguntas, termine com a seção "Perguntas para o usuário", numeradas, uma por linha. Se uma pergunta tiver opções fixas, liste cada opção logo abaixo, como "- [ ] opção"; para sim ou não, liste "- [ ] Sim" e "- [ ] Não"; para texto livre, não liste opções.',
  '- Se não houver perguntas, termine com a linha "Sem perguntas.".',
].join('\n');

export function withAgentRules(prompt: string): string {
  if (prompt.includes(AGENT_RULES)) return prompt;
  return `${prompt.trim()}\n\n${AGENT_RULES}`;
}

export function lastAgentMessage(log: string, maxChars = 6000): string {
  const text = plainTerminalText(log).trim();
  if (text.length <= maxChars) return text;
  const tail = text.slice(text.length - maxChars);
  const boundary = tail.indexOf('\n');
  return (boundary === -1 ? tail : tail.slice(boundary + 1)).trim();
}

export function composeAgentFollowUp(input: { originalPrompt: string; previousMessage: string; answer: string }): string {
  if (input.answer.trim() === '') throw new Error('Escreva a resposta antes de enviar.');
  return withAgentRules([
    input.originalPrompt.trim(),
    '## Mensagem anterior do agente',
    input.previousMessage.trim(),
    '## Resposta do usuário',
    input.answer.trim(),
    'Continue a partir de onde o agente parou, levando em conta a resposta do usuário acima, sem repetir o que já foi entregue.',
  ].join('\n\n'));
}

const QUESTIONS_HEADING = /^[#*_\s]*perguntas para o usuário[*_:\s]*$/i;
const NO_QUESTIONS = /^[-*\d.)\s]*sem perguntas\.?$/i;
const NUMBERED_QUESTION = /^\d+[.)]\s+(.+)$/;
const OPTION = /^[-*]\s+(?:\[[ xX]?\]\s+)?(.+)$/;

export interface AgentQuestion { text: string; options: string[] }
export interface AgentAnswer { selected: string[]; text: string }

/** Questions of the last "Perguntas para o usuário" section; empty when absent or when it says "Sem perguntas.". */
export function parseAgentQuestions(message: string): AgentQuestion[] {
  const lines = message.split('\n').map(line => line.trim());
  let heading = -1;
  lines.forEach((line, index) => {
    if (QUESTIONS_HEADING.test(line)) heading = index;
  });
  if (heading === -1) return [];
  const body = lines.slice(heading + 1).filter(line => line !== '');
  if (body.some(line => NO_QUESTIONS.test(line))) return [];
  const questions: AgentQuestion[] = [];
  for (const line of body) {
    const numbered = NUMBERED_QUESTION.exec(line);
    if (numbered?.[1]) {
      questions.push({ text: numbered[1], options: [] });
      continue;
    }
    const option = OPTION.exec(line);
    const last = questions[questions.length - 1];
    if (option?.[1] && last) {
      last.options.push(option[1]);
    } else if (!option && last && last.options.length === 0) {
      last.text += ` ${line}`;
    } else {
      questions.push({ text: option?.[1] ?? line, options: [] });
    }
  }
  return questions;
}

/** True when the last "Perguntas para o usuário" section of the message lists at least one question. */
export function agentAskedQuestions(message: string): boolean {
  return parseAgentQuestions(message).length > 0;
}

/** One block per question with the selected options and free text; every question needs at least one of them. */
export function formatAgentAnswers(questions: AgentQuestion[], answers: AgentAnswer[]): string {
  return questions.map((question, index) => {
    const answer = answers[index];
    const parts = [...(answer?.selected ?? []), ...(answer && answer.text.trim() !== '' ? [answer.text.trim()] : [])];
    if (parts.length === 0) throw new Error('Responda todas as perguntas antes de enviar.');
    return `${index + 1}. ${question.text}\nResposta: ${parts.join('; ')}`;
  }).join('\n\n');
}
