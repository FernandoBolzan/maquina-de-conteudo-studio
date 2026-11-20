/**
 * Fits ImageGen outputs to the PostNow final frame (ADR-018).
 * The crop is centred and capped at MAX_CROP_PERCENT_PER_SIDE per side; larger crops are refused.
 * Nothing is padded, stretched or pasted.
 */
export const MAX_CROP_PERCENT_PER_SIDE = 3;

export interface ImageSize { width: number; height: number; }
export interface CropBox extends ImageSize { left: number; top: number; cropped: boolean; }

/** Largest centred crop with the target aspect; undefined when a side would lose more than the limit. */
export function planCenterCrop(source: ImageSize, target: ImageSize): CropBox | undefined {
  // Cross-multiplied integers keep the comparison exact: w/h == tw/th  <=>  w*th == h*tw.
  let width = source.width;
  let height = source.height;
  if (source.width * target.height > source.height * target.width) {
    width = Math.floor((source.height * target.width) / target.height);
  } else if (source.width * target.height < source.height * target.width) {
    height = Math.floor((source.width * target.height) / target.width);
  }
  const removedX = source.width - width;
  const removedY = source.height - height;
  const left = Math.floor(removedX / 2);
  const top = Math.floor(removedY / 2);
  const exceeds = (pixels: number, axis: number): boolean => pixels * 100 > axis * MAX_CROP_PERCENT_PER_SIDE;
  if (exceeds(left, source.width) || exceeds(removedX - left, source.width) || exceeds(top, source.height) || exceeds(removedY - top, source.height)) return undefined;
  return { left, top, width, height, cropped: removedX > 0 || removedY > 0 };
}

/** Reads the last stdout line printed by PROBE_SCRIPT; anything but a positive integer size is an error. */
export function parseImageSize(stdout: string): ImageSize {
  const value: unknown = JSON.parse(stdout.trim().split(/\r?\n/).pop() ?? '');
  if (!value || typeof value !== 'object') throw new Error('O PostNow não informou o tamanho da imagem.');
  const { width, height } = value as Record<string, unknown>;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('O PostNow informou um tamanho de imagem inválido.');
  }
  return { width, height };
}

/** Prints {"width","height"} as PIL will see the image, with the EXIF orientation applied. */
export const PROBE_SCRIPT = [
  'import json, sys',
  'from PIL import Image, ImageOps',
  'with Image.open(sys.argv[1]) as opened:',
  '    width, height = ImageOps.exif_transpose(opened).size',
  'print(json.dumps({"width": width, "height": height}))',
].join('\n');

/** Applies the crop box computed by planCenterCrop, scales to the final frame (LANCZOS) and writes RGBA PNG. Makes no decision. */
export const CONFORM_SCRIPT = [
  'import sys',
  'from PIL import Image, ImageOps',
  'src, dst = sys.argv[1], sys.argv[2]',
  'tw, th, sw, sh, left, top, cw, ch = (int(value) for value in sys.argv[3:11])',
  'with Image.open(src) as opened:',
  '    image = ImageOps.exif_transpose(opened).convert("RGBA")',
  'if image.size != (sw, sh):',
  '    raise SystemExit("A imagem mudou entre a leitura e o ajuste.")',
  'if (cw, ch) != (sw, sh):',
  '    image = image.crop((left, top, left + cw, top + ch))',
  'if image.size != (tw, th):',
  '    image = image.resize((tw, th), Image.Resampling.LANCZOS)',
  'image.save(dst, "PNG")',
].join('\n');
/** Fixed lower-right anchor for the PostNow logo; it never moves to another side based on image pixels. */
export function officialLogoPosition(canvas: ImageSize, logo: ImageSize): { x: number; y: number } {
  return {
    x: canvas.width - Math.round(canvas.width * 0.06) - logo.width,
    y: canvas.height - Math.round(canvas.height * 0.06) - logo.height,
  };
}

