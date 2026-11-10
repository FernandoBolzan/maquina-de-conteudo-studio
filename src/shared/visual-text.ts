import { isDepictedPerson, type DepictedPerson } from './depicted-person.js';

/** Limites de texto editável. Medidos após remover espaços das bordas. */
export const VISUAL_TEXT_LIMITS = { headline: 80, copy: 2000, onScreen: 300 } as const;
/** Faixa de palavras recomendada para a headline; fora dela o texto é salvo com aviso. */
export const HEADLINE_WORD_RANGE = { min: 2, max: 6 } as const;

export interface VisualTextEditPage {
  page: number;
  headline: string;
  copy: string;
  depictedPerson: DepictedPerson;
}
export interface VisualTextEditScene { id: string; onScreen: string; }
export type VisualTextField = 'headline' | 'copy' | 'depictedPerson';
export interface VisualTextIssue { field: VisualTextField; message: string; }
export interface VisualTextPageIssues { errors: VisualTextIssue[]; warnings: VisualTextIssue[]; }
export interface VisualTextValidation { errors: string[]; warnings: string[]; }

export function headlineWordCount(headline: string): number {
  return headline.trim().split(/\s+/).filter(Boolean).length;
}

/** Regras de uma página, aplicáveis a rascunhos incompletos (campos podem estar vazios ou inválidos). */
export function visualTextPageIssues(page: Partial<Record<VisualTextField, unknown>>): VisualTextPageIssues {
  const errors: VisualTextIssue[] = [];
  const warnings: VisualTextIssue[] = [];
  const headline = typeof page.headline === 'string' ? page.headline.trim() : '';
  if (!headline) errors.push({ field: 'headline', message: 'Informe a headline.' });
  else if (headline.length > VISUAL_TEXT_LIMITS.headline) errors.push({ field: 'headline', message: `A headline tem no máximo ${VISUAL_TEXT_LIMITS.headline} caracteres.` });
  else {
    const words = headlineWordCount(headline);
    if (words < HEADLINE_WORD_RANGE.min || words > HEADLINE_WORD_RANGE.max) warnings.push({ field: 'headline', message: `A headline tem ${words} palavras; o recomendado é de ${HEADLINE_WORD_RANGE.min} a ${HEADLINE_WORD_RANGE.max}.` });
  }
  const copy = typeof page.copy === 'string' ? page.copy.trim() : '';
  if (!copy) errors.push({ field: 'copy', message: 'Informe a copy.' });
  else if (copy.length > VISUAL_TEXT_LIMITS.copy) errors.push({ field: 'copy', message: `A copy tem no máximo ${VISUAL_TEXT_LIMITS.copy} caracteres.` });
  if (!isDepictedPerson(page.depictedPerson)) errors.push({ field: 'depictedPerson', message: 'Escolha quem aparece na arte.' });
  return { errors, warnings };
}

/**
 * Valida o lote enviado pelo editor. Exige o mesmo número de páginas do projeto, na mesma ordem (page = posição + 1).
 * Mensagens de erro começam com "Página N:" quando dizem respeito a uma página.
 */
export function validateVisualTextPages(pages: unknown, expectedCount: number): VisualTextValidation {
  if (!Array.isArray(pages)) return { errors: ['Envie as páginas do texto.'], warnings: [] };
  if (pages.length !== expectedCount) return { errors: [`O projeto tem ${expectedCount} páginas; o texto enviado tem ${pages.length}. Salve com a mesma quantidade de páginas.`], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  pages.forEach((entry, index) => {
    const number = index + 1;
    if (typeof entry !== 'object' || entry === null) { errors.push(`Página ${number}: dados inválidos.`); return; }
    const record = entry as Record<string, unknown>;
    if (record.page !== number) { errors.push(`Página ${number}: o número da página não corresponde à posição.`); return; }
    const issues = visualTextPageIssues(record);
    for (const issue of issues.errors) errors.push(`Página ${number}: ${issue.message}`);
    for (const issue of issues.warnings) warnings.push(`Página ${number}: ${issue.message}`);
  });
  return { errors, warnings };
}

/** Textos da arte de uma página: a headline e a copy editadas no app. */
export interface ArtText { headline: string; copy: string; }
export interface ArtTextSync { text: string; missing: ('headline' | 'copy')[]; }

/**
 * Troca no arquivo de arte o texto anterior pelo novo, para a arte acompanhar o editor.
 * A copy é trocada primeiro; a headline não é trocada dentro da copy nova.
 * Se um texto anterior não está no arquivo, nada é aplicado e o campo vai para `missing`.
 */
export function applyArtText(artFile: string, previous: ArtText, next: ArtText): ArtTextSync {
  let text = artFile;
  const missing: ArtTextSync['missing'] = [];
  const copyFrom = previous.copy.trim();
  const copyTo = next.copy.trim();
  if (copyFrom !== copyTo) {
    const replaced = replaceAll(text, copyFrom, copyTo);
    if (replaced === text) missing.push('copy');
    else text = replaced;
  }
  const headlineFrom = previous.headline.trim();
  const headlineTo = next.headline.trim();
  if (headlineFrom !== headlineTo) {
    const replaced = replaceOutside(text, copyTo, headlineFrom, headlineTo);
    if (replaced === text) missing.push('headline');
    else text = replaced;
  }
  return missing.length ? { text: artFile, missing } : { text, missing };
}

function replaceAll(text: string, from: string, to: string): string {
  return from ? text.split(from).join(to) : text;
}

/** Troca `from` por `to` em todo o texto, exceto dentro de `kept` (a copy nova, já escrita no arquivo). */
function replaceOutside(text: string, kept: string, from: string, to: string): string {
  if (!kept) return replaceAll(text, from, to);
  return text.split(kept).map(segment => replaceAll(segment, from, to)).join(kept);
}

/** Texto na tela de uma cena: uma linha por item, como o VideoGo grava `onScreen`. */
export function onScreenItems(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}
export function onScreenText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.filter((item): item is string => typeof item === 'string').join('\n');
}
export function onScreenError(text: string): string | undefined {
  return text.length > VISUAL_TEXT_LIMITS.onScreen ? `O texto na tela tem no máximo ${VISUAL_TEXT_LIMITS.onScreen} caracteres.` : undefined;
}

/** Valida cenas do storyboard: cada id precisa existir, sem repetição, e o texto na tela tem limite. */
export function validateStoryboardScenes(scenes: unknown, existingIds: readonly string[]): VisualTextValidation {
  if (!Array.isArray(scenes) || scenes.length === 0) return { errors: ['Envie as cenas do storyboard.'], warnings: [] };
  const known: Record<string, true> = Object.create(null) as Record<string, true>;
  for (const id of existingIds) known[id] = true;
  const seen: Record<string, true> = Object.create(null) as Record<string, true>;
  const errors: string[] = [];
  for (const entry of scenes) {
    if (typeof entry !== 'object' || entry === null) { errors.push('Cena com dados inválidos.'); continue; }
    const scene = entry as Record<string, unknown>;
    if (typeof scene.id !== 'string' || !known[scene.id]) { errors.push('Uma das cenas não existe neste storyboard. Recarregue o projeto.'); continue; }
    if (seen[scene.id]) { errors.push('A lista contém cenas repetidas.'); continue; }
    seen[scene.id] = true;
    if (typeof scene.onScreen !== 'string') { errors.push(`Cena ${scene.id}: texto na tela inválido.`); continue; }
    const message = onScreenError(scene.onScreen);
    if (message) errors.push(`Cena ${scene.id}: ${message}`);
  }
  return { errors, warnings: [] };
}
