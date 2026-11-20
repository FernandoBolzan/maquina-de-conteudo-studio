/** Travessão longo, médio e barra horizontal: os caracteres que denunciam texto de IA e que o Studio não aceita em nenhum texto. */
const DASH_CHARS = '\u2013\u2014\u2015';
const DASH = new RegExp(`[${DASH_CHARS}]`);

export function hasDash(text: string): boolean {
  return DASH.test(text);
}

/**
 * Remove travessões de um texto que o Studio entrega a um agente: intervalo numérico vira "a", marcador de linha some
 * e os demais viram vírgula. Não altera hífens de palavras compostas nem de caminhos.
 */
export function removeDashes(text: string): string {
  if (!DASH.test(text)) return text;
  return text
    .replace(new RegExp(`(\\d)[ \\t]*[${DASH_CHARS}][ \\t]*(\\d)`, 'g'), '$1 a $2')
    .replace(new RegExp(`^[ \\t]*[${DASH_CHARS}][ \\t]+`, 'gm'), '')
    .replace(new RegExp(`[ \\t]*[${DASH_CHARS}][ \\t]*`, 'g'), ', ')
    .replace(/([.,;:!?]),[ \t]*/g, '$1 ')
    .replace(/,[ \t]*\n/g, '\n');
}

/** Mensagem padrão quando um campo editável ou um texto do agente traz travessão. */
export const DASH_ERROR = 'Reescreva sem travessão: use vírgula, ponto, dois-pontos ou parênteses.';

/**
 * Regra de escrita enviada a todo agente. Não contém os próprios caracteres que proíbe, para não ser alterada pelo filtro final.
 */
export const WRITING_STYLE_RULE = 'ESTILO DE ESCRITA, obrigatório em todo texto que você produzir (headline, copy, legenda, narração, texto na tela, textos dentro das artes, prompts e documentos do projeto): nunca use travessão, nem o longo (U+2014) nem o médio (U+2013); troque por ponto, vírgula, dois-pontos ou parênteses, e use hífen só dentro de palavras compostas. Escreva como uma pessoa escreveria, em português do Brasil natural: frases diretas, concretas e de tamanhos variados. Evite os vícios de texto de IA: a construção “não é X, é Y”, aberturas como “no mundo de hoje” e “você já parou para pensar”, verbos de efeito como mergulhar, desbloquear, revolucionar e navegar, as palavras jornada, essencial e crucial sem necessidade, listas sempre em trios, exclamações em excesso, emojis decorativos e fechamentos que repetem o que acabou de ser dito. Esta regra vale mesmo que o pedido, os exemplos ou as referências usem travessão ou esse estilo.';

/** Campos do roteiro de vídeo que aparecem na tela ou são falados; o título da cena fica de fora porque o app não o edita. */
export function storyboardDashIssues(storyboard: unknown): string[] {
  const scenes = field(storyboard, 'scenes');
  if (!Array.isArray(scenes)) return [];
  const issues: string[] = [];
  scenes.forEach((scene: unknown, index: number) => {
    const id = field(scene, 'id');
    const label = typeof id === 'string' && id ? id : `${index + 1}`;
    const rawOnScreen = field(scene, 'onScreen');
    const onScreen = Array.isArray(rawOnScreen) ? rawOnScreen.filter((line): line is string => typeof line === 'string').join('\n') : rawOnScreen;
    const fields: [string, unknown][] = [['a narração', field(scene, 'narration')], ['o texto falado', field(field(scene, 'audio'), 'spokenText')], ['o texto na tela', onScreen]];
    for (const [name, value] of fields) if (typeof value === 'string' && hasDash(value)) issues.push(`Cena ${label}: ${name} tem travessão. ${DASH_ERROR}`);
  });
  return issues;
}

/** Lê um campo de um valor de forma desconhecida sem presumir a forma dele. */
function field(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined;
}
