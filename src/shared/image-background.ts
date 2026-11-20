export const IMAGE_BACKGROUND_MODES = ['light', 'dark'] as const;
export type ImageBackgroundMode = (typeof IMAGE_BACKGROUND_MODES)[number];

export const IMAGE_BACKGROUND_OPTIONS: readonly { value: ImageBackgroundMode; label: string; description: string }[] = [
  { value: 'light', label: 'Fundo claro', description: 'Base clara, com acentos da paleta da marca.' },
  { value: 'dark', label: 'Fundo escuro', description: 'Base escura, com acentos da paleta da marca.' },
];

export function isImageBackgroundMode(value: unknown): value is ImageBackgroundMode {
  return typeof value === 'string' && (IMAGE_BACKGROUND_MODES as readonly string[]).includes(value);
}

function relativeLuminance(hex: string): number | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** Picks a starting choice from the average palette luminance; the user can always override it. */
export function defaultImageBackgroundMode(colors: readonly string[]): ImageBackgroundMode {
  const luminance = colors.map(relativeLuminance).filter((value): value is number => value !== undefined);
  if (!luminance.length) return 'light';
  return luminance.reduce((sum, value) => sum + value, 0) / luminance.length < 0.45 ? 'dark' : 'light';
}

export function resolveImageBackgroundMode(value: unknown, colors: readonly string[]): ImageBackgroundMode {
  if (value === undefined) return defaultImageBackgroundMode(colors);
  if (!isImageBackgroundMode(value)) throw new Error('Escolha fundo claro ou escuro para a arte.');
  return value;
}
export function imageBackgroundRule(mode: ImageBackgroundMode): string {
  return mode === 'dark'
    ? 'DIREÇÃO DE FUNDO ESCOLHIDA: use uma base escura, como grafite ou um tom escuro compatível com a paleta da marca, em todas as páginas. Aplique as cores oficiais como acentos e texto, mantendo contraste alto, legibilidade e a identidade das referências.'
    : 'DIREÇÃO DE FUNDO ESCOLHIDA: use uma base clara, como branco, off-white ou um tom claro compatível com a paleta da marca, em todas as páginas. Aplique as cores oficiais como acentos e texto, mantendo contraste alto, legibilidade e a identidade das referências.';
}
