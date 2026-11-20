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

/**
 * Bloqueio do plano de retratos. `identities[i]` é a escolha da página i+1. Escolhas ausentes ou inválidas
 * são bloqueadas por quem valida cada página; aqui entra só a regra do retrato: `client_portrait` exige uma foto da pessoa na marca.
 * Ter foto da pessoa não obriga nenhuma página a mostrá-la: a escolha é da pessoa, página a página (a IA propõe cliente na capa e no fechamento).
 */
export function portraitPlanIssues(identities: readonly unknown[], portraitApproved: boolean): string[] {
  if (portraitApproved) return [];
  return identities.flatMap((identity, index) => identity === 'client_portrait'
    ? [`Página ${index + 1}: Cliente (retrato aprovado) exige uma foto marcada como retrato da cliente na marca. Marque-a em Marcas ou escolha outra opção.`]
    : []);
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

/** Bloqueios da preferência de projeto ao salvar: `client_portrait` exige foto da pessoa na marca; os demais valores valem com ou sem foto. */
export function depictedPersonPolicyIssues(policy: DepictedPersonPolicy, portraitApproved: boolean): string[] {
  if (policy === 'client_portrait' && !portraitApproved) {
    return ['Cliente (retrato aprovado) exige uma foto marcada como retrato da cliente na marca. Marque-a em Marcas ou escolha outra opção.'];
  }
  return [];
}

/** Política usada no prompt: se a preferência salva não couber no estado atual do retrato, vale `auto` (o agente decide pela pauta). */
export function effectiveDepictedPersonPolicy(policy: DepictedPersonPolicy | undefined, portraitApproved: boolean): DepictedPersonPolicy {
  const value = policy ?? 'auto';
  return depictedPersonPolicyIssues(value, portraitApproved).length ? 'auto' : value;
}
