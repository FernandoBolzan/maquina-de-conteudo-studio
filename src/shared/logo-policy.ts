/** Where the official PostNow logo lands in one round. Chosen per round at generation or render time, never stored in project.json. */
export const LOGO_POLICIES = ['cover-closing', 'all-pages', 'none'] as const;
export type LogoPolicy = (typeof LOGO_POLICIES)[number];

export const LOGO_POLICY_OPTIONS: readonly { value: LogoPolicy; label: string; description: string }[] = [
  { value: 'cover-closing', label: 'Capa e fechamento', description: 'Logo só na primeira e na última página.' },
  { value: 'all-pages', label: 'Todas as páginas', description: 'Logo em todas as páginas da rodada.' },
  { value: 'none', label: 'Nenhuma página', description: 'As artes saem sem a logo oficial.' },
];

export function isLogoPolicy(value: unknown): value is LogoPolicy {
  return typeof value === 'string' && (LOGO_POLICIES as readonly string[]).includes(value);
}

/** 1-based pages of a round with `count` pages that receive the official logo. */
export function logoPagesFor(policy: LogoPolicy, count: number): number[] {
  if (policy === 'none') return [];
  const every = Array.from({ length: count }, (_, index) => index + 1);
  if (policy === 'all-pages') return every;
  return count > 1 ? [1, count] : every;
}
