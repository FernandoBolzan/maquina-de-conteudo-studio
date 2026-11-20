import { createHash } from 'node:crypto';

/** Ações distintas e naturais para retratos; o ponto de partida varia por projeto para que posts diferentes não saiam iguais. */
export const PORTRAIT_SCENES: readonly string[] = [
  'olhando direto para a câmera, sorriso acolhedor e postura aberta',
  'usando o celular, com o olhar na tela e expressão de atenção',
  'digitando no notebook, com o olhar concentrado',
  'em pé, explicando algo com um gesto das mãos',
  'caminhando, em movimento, com o olhar levemente de lado',
  'conversando e gesticulando como em um atendimento',
  'em pé, de braços cruzados, confiante e olhando para a câmera',
  'anotando em uma agenda ou prancheta',
  'segurando uma xícara, em um momento descontraído',
  'ouvindo com atenção durante uma conversa ou reunião',
];

/** Cenas sugeridas de capa e fechamento para este projeto: determinísticas, diferentes entre si e entre projetos. */
export function portraitScenesFor(projectId: string): { cover: string; closing: string } {
  const start = parseInt(createHash('sha256').update(projectId).digest('hex').slice(0, 8), 16) % PORTRAIT_SCENES.length;
  const closing = (start + Math.floor(PORTRAIT_SCENES.length / 2)) % PORTRAIT_SCENES.length;
  return { cover: PORTRAIT_SCENES[start]!, closing: PORTRAIT_SCENES[closing]! };
}

/** Regra enviada ao agente que escreve os prompts: a referência fixa só a identidade; a cena é criada por projeto e por página. */
export function personVarietyRule(projectId: string): string {
  const { cover, closing } = portraitScenesFor(projectId);
  return `VARIEDADE DE POSES E CENAS (obrigatória): a foto de referência da marca fixa SOMENTE o rosto e a identidade real da pessoa. Nunca copie a pose, a roupa, o cenário, o enquadramento ou a ação da foto de referência e nunca escreva “preserve a pose” ou “use a roupa da foto” em um prompt. Em todo prompt com pessoa, descreva do zero a ação, a pose, o olhar, a roupa e o cenário, coerentes com quem a pessoa é (profissão, rotina, público) e com o assunto da página. Varie entre olhar para a câmera, usar o celular, digitar no notebook, explicar com gestos, caminhar, atender, anotar e outras ações naturais. Proibido repetir a mesma pose, roupa ou cenário entre páginas e proibido usar “lendo um livro à mesa” como padrão. Ponto de partida deste projeto, para que não saia igual aos outros posts: capa: ${cover}; fechamento: ${closing}. Adapte ao assunto e à profissão sem voltar à pose da referência.`;
}
