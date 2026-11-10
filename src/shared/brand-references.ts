import type { BrandReference } from './contracts.js';

/** ImageGen receives at most this many brand reference images per request; the rest stay as text context. */
export const IMAGEGEN_REFERENCE_LIMIT = 10;

/** Raster formats the Codex image input accepts. Lookup table, not a Set, per repo convention. */
const ATTACHABLE_EXTENSIONS: Record<string, true> = { '.png': true, '.jpg': true, '.jpeg': true, '.webp': true };

export interface ImageGenerationReferences {
  attached: BrandReference[];
  skipped: BrandReference[];
}

/** Lowercase extension of a stored path. No node:path here: this module is also bundled into the renderer. */
function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

export function isAttachableReference(reference: BrandReference): boolean {
  // Codex may split `--image` values on commas (not verified on the installed binary): such paths stay text-only.
  return reference.kind === 'image' && ATTACHABLE_EXTENSIONS[extensionOf(reference.path)] === true && !reference.path.includes(',');
}

/** Splits brand references, in brand order, into those passed to ImageGen as `--image` and those kept as text only. */
export function imageGenerationReferences(references: BrandReference[]): ImageGenerationReferences {
  const attached: BrandReference[] = [];
  const skipped: BrandReference[] = [];
  for (const reference of references) {
    if (isAttachableReference(reference) && attached.length < IMAGEGEN_REFERENCE_LIMIT) attached.push(reference);
    else skipped.push(reference);
  }
  return { attached, skipped };
}
