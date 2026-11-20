/**
 * Onde o conteúdo vive em cada tipo de publicação.
 * Carrossel: a capa só abre (gancho), o conteúdo fica nas páginas do meio e a última fecha com a chamada final.
 * Imagem única (post): o conteúdo vai na legenda; a arte traz só um gancho curto e sempre chama para ler a descrição.
 */
export const SINGLE_IMAGE_CTA = 'Leia a descrição';

export const CAROUSEL_STRUCTURE_RULE = 'ESTRUTURA DO CARROSSEL (regra do Studio): a CAPA nunca traz o conteúdo. Na capa vai só o gancho: um título que desperta a vontade de deslizar e, no máximo, uma frase curta de promessa, sem listas, passos, etapas, números enumerados ("1)", "2)") nem explicações. Todo o conteúdo (passos, dicas, fatos, exemplos, ressalvas) é distribuído nas páginas ENTRE a capa e a última página, uma ideia por página. A ÚLTIMA página fecha: resumo curto e a chamada final do projeto, sem conteúdo novo. A LEGENDA da publicação é UMA SÓ para o carrossel inteiro: escreva-a uma vez e grave exatamente o mesmo texto no campo copy de todas as páginas e na seção de legenda do prompt de cada página; nunca escreva legendas diferentes por página.';

export const SINGLE_IMAGE_STRUCTURE_RULE = `ESTRUTURA DA IMAGEM ÚNICA (regra do Studio): o conteúdo vai na copy (legenda). Na arte entram só um headline curto de gancho e um body curto, sem listas, passos, dicas nem explicações. O body SEMPRE termina chamando para ler a descrição, com estas palavras: "${SINGLE_IMAGE_CTA}." A chamada final do projeto (ex.: "Salve e compartilhe") fica só na copy, nunca na arte. Copy, passos, dicas, fontes e ressalvas ficam na legenda.`;

const ENUMERATION = /(?:^|[\s:;,])\d{1,2}\s*\)|(?:^|\s)\d{1,2}\.\s+\p{L}|[•▪◦]/u;

/** Capa de carrossel com lista, passos ou explicação no subtítulo: o conteúdo precisa ir para as páginas do meio. */
export function carouselCoverIssue(body: string): string | undefined {
  const text = body.trim();
  if (!text) return undefined;
  if (ENUMERATION.test(text) || (text.match(/;/g) ?? []).length >= 2) {
    return 'a capa do carrossel não pode trazer o conteúdo (lista, passos ou números enumerados). Deixe só o gancho na capa e passe o conteúdo para as páginas do meio.';
  }
  return undefined;
}

/** Imagem única: a arte precisa chamar para ler a descrição. */
export function singleImageCtaIssue(headline: string, body: string): string | undefined {
  return /descri[cç][aã]o/i.test(`${headline} ${body}`)
    ? undefined
    : `na imagem única a arte precisa chamar para ler a descrição. Termine o subtítulo com “${SINGLE_IMAGE_CTA}.” e deixe o conteúdo na legenda.`;
}


/** Dica curta mostrada no subtítulo da primeira página do editor de textos. */
export function structureHint(kind: string | undefined, pageCount: number): string | undefined {
  if (kind === 'carousel' && pageCount > 1) return 'Na capa vai só o gancho; o conteúdo fica nas páginas do meio.';
  if (kind === 'post' && pageCount === 1) return `Termine com “${SINGLE_IMAGE_CTA}.” e deixe o conteúdo na legenda.`;
  return undefined;
}