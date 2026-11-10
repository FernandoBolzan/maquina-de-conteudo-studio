import type { PostNowKind } from './formats.js';

/**
 * Quem aparece na arte de cada página (`depicted_person` em project.json).
 * `client_portrait` usa o retrato aprovado da marca (`brand.owner_portrait` no perfil do motor PostNow).
 * Sem retrato aprovado, o Studio bloqueia `client_portrait` antes de qualquer chamada ao motor ou ao Codex.
 */
export const DEPICTED_PERSON_VALUES = ['none', 'other_person', 'client_portrait'] as const;
export type DepictedPerson = (typeof DEPICTED_PERSON_VALUES)[number];
export const DEPICTED_PERSON_LABELS: Record<DepictedPerson, string> = {
  none: 'Ninguém (sem pessoas nem rostos)',
  other_person: 'Outra pessoa (não é o cliente)',
  client_portrait: 'Cliente (retrato aprovado)',
};
export function isDepictedPerson(value: unknown): value is DepictedPerson {
  return typeof value === 'string' && (DEPICTED_PERSON_VALUES as readonly string[]).includes(value);
}

/** Páginas que mostram a cliente quando há retrato aprovado: capa e última página do carrossel; a única página de post ou Story. Números começam em 1. */
export function portraitRequiredPages(kind: PostNowKind, pageCount: number): number[] {
  if (pageCount < 1) return [];
  return kind === 'carousel' && pageCount > 1 ? [1, pageCount] : [1];
}

/**
 * Bloqueios do plano de retratos. `identities[i]` é a escolha da página i+1. Escolhas ausentes ou inválidas
 * são bloqueadas por quem valida cada página; aqui entram só as regras de retrato.
 */
export function portraitPlanIssues(kind: PostNowKind, identities: readonly unknown[], portraitApproved: boolean): string[] {
  const withoutPortrait = identities.flatMap((identity, index) => identity === 'client_portrait' && !portraitApproved
    ? [`Página ${index + 1}: Cliente (retrato aprovado) exige um retrato aprovado no perfil PostNow da marca. Cadastre-o com \`postnow client set-portrait\`.`]
    : []);
  if (!portraitApproved) return withoutPortrait;
  const missingClient = portraitRequiredPages(kind, identities.length)
    .filter(page => isDepictedPerson(identities[page - 1]) && identities[page - 1] !== 'client_portrait')
    .map(page => `Página ${page}: com retrato aprovado, esta página precisa mostrar a cliente; escolha Cliente (retrato aprovado).`);
  return [...withoutPortrait, ...missingClient];
}

/** Impede que a capa e o fechamento do carrossel usem a mesma cena, pose ou descrição idêntica da cliente. */
export function portraitDiversityIssues(kind: PostNowKind, pages: readonly { visualFunction?: string }[]): string[] {
  if (kind !== 'carousel' || pages.length < 3) return [];
  const first = pages[0]?.visualFunction?.trim().toLowerCase();
  const last = pages[pages.length - 1]?.visualFunction?.trim().toLowerCase();
  if (first && last && first === last) {
    return ['A capa e o fechamento não podem ter a mesma descrição visual ou pose da cliente. Varie a composição entre o começo e o final do carrossel.'];
  }
  return [];
}
