import { isDepictedPerson, type DepictedPerson } from './depicted-person.js';
import { DASH_ERROR, hasDash } from './writing-style.js';

/** Limites de texto editável. Medidos após remover espaços das bordas. */
export const VISUAL_TEXT_LIMITS = { headline: 80, body: 180, copy: 2000, onScreen: 300 } as const;
/** Faixa de palavras recomendada para a headline; fora dela o texto é salvo com aviso. */
export const HEADLINE_WORD_RANGE = { min: 2, max: 6 } as const;

export interface VisualTextEditPage {
  page: number;
  headline: string;
  body: string;
  copy: string;
  depictedPerson: DepictedPerson;
}
export interface VisualTextEditScene { id: string; onScreen: string; }
export type VisualTextField = 'headline' | 'body' | 'copy' | 'depictedPerson';
export interface VisualTextIssue { field: VisualTextField; message: string; }
export interface VisualTextPageIssues { errors: VisualTextIssue[]; warnings: VisualTextIssue[]; }
export interface VisualTextValidation { errors: string[]; warnings: string[]; }

export function headlineWordCount(headline: string): number {
  return headline.trim().split(/\s+/).filter(Boolean).length;
}

/** Toda legenda de publicação termina com uma última linha de exatamente este número de hashtags. */
export const CAPTION_HASHTAG_COUNT = 5;
/** Instrução enviada à IA que escreve legendas. */
export const CAPTION_HASHTAG_RULE = `HASHTAGS OBRIGATÓRIAS: termine toda legenda ou descrição com uma última linha contendo exatamente ${CAPTION_HASHTAG_COUNT} hashtags relacionadas ao tema, em português, diferentes entre si e separadas por espaço (ex.: #tema #assunto). Nenhum texto depois delas e nenhuma outra hashtag fora dessa linha.`;
export const CAPTION_HASHTAG_ERROR = `A legenda precisa terminar com uma linha de exatamente ${CAPTION_HASHTAG_COUNT} hashtags relacionadas, diferentes entre si.`;
/** Texto de erro quando a última linha da legenda não é exatamente 5 hashtags diferentes; undefined quando está certo. */
export function captionHashtagIssue(copy: string): string | undefined {
  const lines = copy.trim().split(/\r?\n/);
  const tokens = (lines[lines.length - 1] ?? '').trim().split(/\s+/).filter(Boolean);
  const valid = tokens.length === CAPTION_HASHTAG_COUNT
    && tokens.every(token => /^#[\p{L}\p{N}_]+$/u.test(token))
    && new Set(tokens.map(token => token.toLowerCase())).size === CAPTION_HASHTAG_COUNT;
  return valid ? undefined : CAPTION_HASHTAG_ERROR;
}

/** Regras de uma página, aplicáveis a rascunhos incompletos (campos podem estar vazios ou inválidos). */
export function visualTextPageIssues(page: Partial<Record<VisualTextField, unknown>>): VisualTextPageIssues {
  const errors: VisualTextIssue[] = [];
  const warnings: VisualTextIssue[] = [];
  const headline = typeof page.headline === 'string' ? page.headline.trim() : '';
  if (!headline) errors.push({ field: 'headline', message: 'Informe a headline.' });
  else if (headline.length > VISUAL_TEXT_LIMITS.headline) errors.push({ field: 'headline', message: `A headline tem no máximo ${VISUAL_TEXT_LIMITS.headline} caracteres.` });
  else {
    if (hasDash(headline)) errors.push({ field: 'headline', message: DASH_ERROR });
    const words = headlineWordCount(headline);
    if (words < HEADLINE_WORD_RANGE.min || words > HEADLINE_WORD_RANGE.max) warnings.push({ field: 'headline', message: `A headline tem ${words} palavras; o recomendado é de ${HEADLINE_WORD_RANGE.min} a ${HEADLINE_WORD_RANGE.max}.` });
  }
  const body = typeof page.body === 'string' ? page.body.trim() : '';
  if (!body) errors.push({ field: 'body', message: 'Informe o subtítulo da arte.' });
  else if (body.length > VISUAL_TEXT_LIMITS.body) errors.push({ field: 'body', message: `O subtítulo tem no máximo ${VISUAL_TEXT_LIMITS.body} caracteres.` });
  if (hasDash(body)) errors.push({ field: 'body', message: DASH_ERROR });
  const copy = typeof page.copy === 'string' ? page.copy.trim() : '';
  if (!copy) errors.push({ field: 'copy', message: 'Informe a legenda.' });
  else if (copy.length > VISUAL_TEXT_LIMITS.copy) errors.push({ field: 'copy', message: `A legenda tem no máximo ${VISUAL_TEXT_LIMITS.copy} caracteres.` });
  else {
    const hashtagIssue = captionHashtagIssue(copy);
    if (hashtagIssue) errors.push({ field: 'copy', message: hashtagIssue });
  }
  if (hasDash(copy)) errors.push({ field: 'copy', message: DASH_ERROR });
  if (!isDepictedPerson(page.depictedPerson)) errors.push({ field: 'depictedPerson', message: 'Escolha quem aparece na arte.' });
  return { errors, warnings };
}

/**
 * Editorial caption mirror marker used in local art prompts. Caption remains publication copy,
 * never a renderable art field.
 */
export const CAPTION_MIRROR_LABEL = 'Copy para publicação/legenda, NÃO imprimir na arte:';
export function captionMirror(prompt: string): string | undefined {
  const label = new RegExp(`^## ${escapeRegExp(CAPTION_MIRROR_LABEL)}\\s*\\r?\\n`, 'm');
  const match = label.exec(prompt);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const nextSection = prompt.slice(start).search(/^(?:## |POSTNOW_[A-Z_]+=)/m);
  const section = prompt.slice(start, nextSection < 0 ? undefined : start + nextSection);
  return section.trim();
}

/** Texts on a single art; publication copy lives only in the caption section. */
export interface ArtText { headline: string; body: string; copy: string; }
export interface ArtTextSync { text: string; missing: ('headline' | 'body' | 'copy')[]; }

/** Replaces art fields and the exact caption-only mirror. */
export function applyArtText(artFile: string, previous: ArtText, next: ArtText): ArtTextSync {
  let text = artFile;
  const missing: ArtTextSync['missing'] = [];
  const copyFrom = previous.copy.trim();
  const copyTo = next.copy.trim();
  if (copyFrom !== copyTo) {
    const replaced = replaceCaptionMirror(text, copyFrom, copyTo);
    if (replaced === undefined) missing.push('copy');
    else text = replaced;
  }
  for (const field of ['headline', 'body'] as const) {
    const from = previous[field].trim();
    const to = next[field].trim();
    if (from === to) continue;
    const replaced = from ? replaceOutside(text, copyTo, from, to) : replaceBlankArtField(text, field, to);
    if (replaced === undefined || (from && replaced === text)) missing.push(field);
    else text = replaced;
  }
  return missing.length ? { text: artFile, missing } : { text, missing };
}

function replaceCaptionMirror(text: string, from: string, to: string): string | undefined {
  const label = new RegExp(`^## ${escapeRegExp(CAPTION_MIRROR_LABEL)}\\s*\\r?\\n`, 'm');
  const match = label.exec(text);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const nextSection = text.slice(start).search(/^## /m);
  const end = nextSection < 0 ? text.length : start + nextSection;
  const content = text.slice(start, end);
  if (!from) {
    if (content.trim()) return content.trim() === to ? text : undefined;
    return `${text.slice(0, start)}${to}${content.endsWith('\n') ? '' : '\n'}${text.slice(end)}`;
  }
  const updated = replaceAll(content, from, to);
  if (updated === content) return undefined;
  return `${text.slice(0, start)}${updated}${text.slice(end)}`;
}
function replaceBlankArtField(text: string, field: 'headline' | 'body', value: string): string | undefined {
  const label = field === 'headline' ? 'Headline' : 'Body';
  const line = new RegExp(`^(${label}:[ \\t]*)$`, 'mi');
  const match = line.exec(text);
  if (!match) return undefined;
  return `${text.slice(0, match.index)}${match[1]}${value}${text.slice(match.index + match[0].length)}`;
}
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

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
  if (hasDash(text)) return DASH_ERROR;
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
