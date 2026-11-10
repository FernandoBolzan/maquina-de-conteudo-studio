/** Campos de texto de uma página, como o agente os grava no projeto. */
export interface TextPageFields {
  headline: string;
  copy: string;
}

/** Há algum texto gravado nas páginas. Usado para não sobrescrever trabalho existente. */
export function hasTextContent(pages: readonly TextPageFields[]): boolean {
  return pages.some(page => page.headline.trim() !== '' || page.copy.trim() !== '');
}

/**
 * Salvar uma pauta alterada dispara a geração de textos só em projeto de imagem sem texto gravado
 * e sem sessão em andamento. Pauta igual ou vazia, vídeo, sessão ativa e texto existente não disparam.
 */
export function shouldAutoStartTextGeneration(input: {
  kind: 'image' | 'video';
  previousBrief: string;
  nextBrief: string;
  pages: readonly TextPageFields[];
  sessionRunning: boolean;
}): boolean {
  const nextBrief = input.nextBrief.trim();
  return input.kind === 'image'
    && nextBrief !== ''
    && nextBrief !== input.previousBrief.trim()
    && !input.sessionRunning
    && !hasTextContent(input.pages);
}
