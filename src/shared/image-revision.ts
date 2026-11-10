/** Revision provenance written to a batch: kept pages are reused byte-for-byte from `of`. */
export interface RevisionSource { of: string; keptPages: number[]; redonePages: number[]; }

export interface RevisionPage {
  page: number;
  decision?: 'keep' | 'redo';
  note?: string;
}

export interface ReviewPlan {
  ok: boolean;
  error?: string;
  keptPages: number[];
  redonePages: number[];
}
/** Derives which pages are kept or redone. Every page must be decided; at least one redo is required. */
export function reviewPlan(pages: RevisionPage[]): ReviewPlan {
  const keptPages: number[] = [];
  const redonePages: number[] = [];
  const undecided: number[] = [];
  for (const entry of pages) {
    if (entry.decision === 'keep') keptPages.push(entry.page);
    else if (entry.decision === 'redo') redonePages.push(entry.page);
    else undecided.push(entry.page);
  }
  keptPages.sort((a, b) => a - b);
  redonePages.sort((a, b) => a - b);
  if (undecided.length > 0) {
    undecided.sort((a, b) => a - b);
    return { ok: false, error: `Falta decidir: páginas ${undecided.join(', ')}.`, keptPages, redonePages };
  }
  if (redonePages.length === 0) return { ok: false, error: 'Marque ao menos uma imagem para refazer.', keptPages, redonePages };
  return { ok: true, keptPages, redonePages };
}

/** Pages kept from the previous batch, each identical to the file it was reused from. */
export function carryForward(keptPages: number[], previousBatchId: string): Array<{ page: number; from: string }> {
  return [...keptPages].sort((a, b) => a - b).map(page => ({ page, from: previousBatchId }));
}

/** Builds the Codex instruction that regenerates only the redone pages. */
export function buildRevisionPrompt(input: { redonePages: number[]; keptPages: number[]; notes: Record<number, string> }): string {
  const redo = [...input.redonePages].sort((a, b) => a - b);
  const lines = [
    `Refaça somente as páginas ${redo.join(', ')} do carrossel.`,
    `Não altere as páginas ${[...input.keptPages].sort((a, b) => a - b).join(', ')}; elas serão reaproveitadas como estão.`,
  ];
  for (const page of redo) {
    const note = input.notes[page]?.trim();
    if (note) lines.push(`Página ${page}: ${note}`);
  }
  return lines.join('\n');
}
