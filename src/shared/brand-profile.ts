import type { Brand } from './contracts.js';

/** Perfil `videogo.profile/v1` derivado da marca cadastrada; o VideoGo aplica paleta e logo no render. */
export interface VideoGoBrandProfile {
  schema: 'videogo.profile/v1';
  id: string;
  name: string;
  summary: string;
  baseStyle: 'motion-kinetic';
  palette: Record<'mode' | 'canvas' | 'foreground' | 'muted' | 'surface' | 'surfaceBorder' | 'accent' | 'accentAlt' | 'accentSoft' | 'danger', string>;
  accents: [string, string, string, string];
  brand: { name: string; logo?: string };
  notes: string;
}

/** Vermelho de alerta do VideoGo; a marca não define cor de erro. */
const DANGER = '#ff4d5e';
const HEX = /^#[0-9a-f]{6}$/i;
const PROFILE_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function chroma(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return Math.max(...channels) - Math.min(...channels);
}

/**
 * Mapeia as cores da marca para a paleta do VideoGo: a mais escura vira fundo, a mais clara texto
 * e a mais saturada das restantes vira destaque. Exige duas cores distintas no mínimo.
 */
export function brandVideoPalette(colors: string[]): VideoGoBrandProfile['palette'] {
  const unique = [...new Set(colors.map((color) => color.toLowerCase()))];
  if (unique.length < 2 || !unique.every((color) => HEX.test(color))) throw new Error('A marca precisa de pelo menos duas cores hexadecimais para o VideoGo.');
  const sorted = [...unique].sort((a, b) => luminance(a) - luminance(b));
  const canvas = sorted[0];
  const foreground = sorted[sorted.length - 1];
  const rest = sorted.slice(1, -1);
  const accent = rest.length ? rest.reduce((best, color) => (chroma(color) > chroma(best) ? color : best)) : foreground;
  return {
    mode: luminance(canvas) < 0.2 ? 'dark' : 'light',
    canvas,
    foreground,
    muted: foreground,
    surface: canvas,
    surfaceBorder: accent,
    accent,
    accentAlt: accent,
    accentSoft: accent,
    danger: DANGER,
  };
}

/** Quatro destaques só com cores da marca; sem eles o VideoGo completa com o coral e o verde-limão do estilo base. */
function brandAccents(palette: VideoGoBrandProfile['palette'], colors: string[]): VideoGoBrandProfile['accents'] {
  const others = [...new Set(colors.map((color) => color.toLowerCase()))]
    .filter((color) => color !== palette.canvas && color !== palette.accent)
    .sort((a, b) => chroma(b) - chroma(a));
  const cycle = [palette.accent, ...others];
  return [cycle[0], cycle[1 % cycle.length], cycle[2 % cycle.length], cycle[3 % cycle.length]];
}

/** Monta o perfil VideoGo da marca; `logo` é o nome do arquivo ao lado de profile.json. */
export function videoGoBrandProfile(brand: Brand, logo?: string): VideoGoBrandProfile {
  const id = brand.id.toLowerCase();
  if (!PROFILE_ID.test(id)) throw new Error('Id da marca incompatível com perfil do VideoGo.');
  const palette = brandVideoPalette(brand.colors);
  return {
    schema: 'videogo.profile/v1',
    id,
    name: brand.name,
    summary: `Marca ${brand.name}: cores ${brand.colors.join(', ')}.`,
    baseStyle: 'motion-kinetic',
    palette,
    accents: brandAccents(palette, brand.colors),
    brand: logo ? { name: brand.name, logo } : { name: brand.name },
    notes: brand.tone,
  };
}
