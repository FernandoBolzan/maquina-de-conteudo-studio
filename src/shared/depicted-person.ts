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

/** Preferência de projeto (etapa Pauta). `auto` deixa o agente decidir pela pauta; os demais valem para todas as páginas. */
export const DEPICTED_PERSON_POLICY_VALUES = ['auto', ...DEPICTED_PERSON_VALUES] as const;
export type DepictedPersonPolicy = (typeof DEPICTED_PERSON_POLICY_VALUES)[number];
export const DEPICTED_PERSON_POLICY_LABELS: Record<DepictedPersonPolicy, string> = {
  auto: 'Automático (a IA decide)',
  none: DEPICTED_PERSON_LABELS.none,
  other_person: DEPICTED_PERSON_LABELS.other_person,
  client_portrait: DEPICTED_PERSON_LABELS.client_portrait,
};
export function isDepictedPersonPolicy(value: unknown): value is DepictedPersonPolicy {
  return typeof value === 'string' && (DEPICTED_PERSON_POLICY_VALUES as readonly string[]).includes(value);
}

/** Blocks portrait identities before any PostNow profile/reference lookup when brand photos are opted out. */
export function brandImageOptOutIssues(identities: readonly unknown[]): string[] {
  return identities.some(identity => identity === 'client_portrait')
    ? ['A foto/retrato da marca foi desativado; altere a página para `none` ou `other_person`, salve/aprove novamente o conteúdo e tente novamente.']
    : [];
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
    ? [`Página ${index + 1}: Cliente (retrato aprovado) exige uma foto marcada como retrato da cliente na marca. Marque-a em Marcas ou escolha outra opção.`]
    : []);
  if (!portraitApproved) return withoutPortrait;
  const missingClient = portraitRequiredPages(kind, identities.length)
    .filter(page => isDepictedPerson(identities[page - 1]) && identities[page - 1] !== 'client_portrait')
    .map(page => `Página ${page}: com retrato aprovado, esta página precisa mostrar a cliente; escolha Cliente (retrato aprovado). Se não deve mostrar a cliente, desmarque o retrato em Marcas.`);
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

/**
 * Bloqueios da preferência de projeto ao salvar. Com retrato aprovado, capa e fechamento precisam mostrar a cliente,
 * então `none` e `other_person` ficam indisponíveis; `client_portrait` exige o retrato.
 */
export function depictedPersonPolicyIssues(policy: DepictedPersonPolicy, portraitApproved: boolean): string[] {
  if (policy === 'client_portrait' && !portraitApproved) {
    return ['Cliente (retrato aprovado) exige uma foto marcada como retrato da cliente na marca. Marque-a em Marcas ou escolha outra opção.'];
  }
  if (portraitApproved && (policy === 'none' || policy === 'other_person')) {
    return ['Com retrato aprovado, a capa e o fechamento precisam mostrar a cliente. Escolha Automático ou Cliente (retrato aprovado), ou desmarque o retrato da cliente em Marcas.'];
  }
  return [];
}

/** Política usada no prompt: se a preferência salva não couber no estado atual do retrato, vale `auto` (o agente decide pela pauta). */
export function effectiveDepictedPersonPolicy(policy: DepictedPersonPolicy | undefined, portraitApproved: boolean): DepictedPersonPolicy {
  const value = policy ?? 'auto';
  return depictedPersonPolicyIssues(value, portraitApproved).length ? 'auto' : value;
}
