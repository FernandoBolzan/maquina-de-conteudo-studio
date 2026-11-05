import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Brand, Job, Project } from '../../shared/contracts.js';
import type { Services } from '../context.js';
import { resolveTool, toolEnvironment } from '../setup.js';
import { atomicJson, directory, object, readJson } from './storage.js';

const RENDER_SCRIPT = `
import json, os, sys, textwrap
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

spec = json.loads(os.environ["MDC_CAROUSEL_SPEC"])
project_dir = spec["projectDir"]
out_dir = os.path.join(project_dir, "generated")
os.makedirs(out_dir, exist_ok=True)

def parse_hex(h, fallback=(249, 115, 22)):
    h = (h or "").strip().lstrip("#")
    if len(h) == 6:
        try:
            return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
        except Exception:
            pass
    return fallback

colors = spec.get("colors") or ["#F97316", "#121110", "#FAFAFA"]
accent = parse_hex(colors[0], (249, 115, 22))
lum = 0.2126 * accent[0] + 0.7152 * accent[1] + 0.0722 * accent[2]
accent_text = tuple(min(255, int(c + (255 - c) * 0.58)) for c in accent) if lum < 140 else accent
dark = parse_hex(colors[1] if len(colors) > 1 else "#121110", (18, 17, 16))
light = (250, 250, 250)
SERIF_CANDIDATES = [
    "/usr/share/fonts/opentype/urw-base35/P052-Bold.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "C:/Windows/Fonts/georgiab.ttf",
]
SANS_BOLD_CANDIDATES = [
    "/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]
SANS_REG_CANDIDATES = [
    "/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
]

def load_font(candidates, size):
    for p in candidates:
        if os.path.isfile(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

f_tag = load_font(SANS_BOLD_CANDIDATES, 22)
f_head = load_font(SERIF_CANDIDATES, 54)
f_body = load_font(SANS_REG_CANDIDATES, 32)
f_footer = load_font(SANS_BOLD_CANDIDATES, 24)
f_num = load_font(SANS_BOLD_CANDIDATES, 24)

raw_photos = [p for p in (spec.get("photos") or []) if os.path.isfile(p)]
def photo_score(p):
    try:
        with Image.open(p) as im:
            w, h = im.size
            return 0 if h >= w else 1
    except Exception:
        return 2
photos = sorted(raw_photos, key=photo_score)
logo_path = spec.get("logo")
brand_name = (spec.get("brandName") or "MÁQUINA DE CONTEÚDO").upper()
pages = spec.get("pages") or []
total = len(pages)

for idx, page in enumerate(pages):
    W, H = 1080, 1350
    base = Image.new("RGBA", (W, H), (*dark, 255))

    if photos:
        photo_path = photos[idx % len(photos)]
        try:
            ph = Image.open(photo_path).convert("RGBA")
            centering = (0.5, 0.25) if ph.height >= ph.width else (0.5, 0.5)
            fitted = ImageOps.fit(ph, (W, H), method=Image.Resampling.LANCZOS, centering=centering)
            base.paste(fitted, (0, 0))
        except Exception:
            pass

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    for y in range(H):
        ratio = y / float(H)
        if photos:
            if ratio < 0.18:
                alpha = int(85 * (1.0 - ratio / 0.18))
                col = dark
            elif ratio < 0.42:
                alpha = 0
                col = dark
            else:
                t = (ratio - 0.42) / 0.58
                alpha = int(248 * (t ** 1.15))
                mix = max(0.0, (ratio - 0.55) / 0.45) * 0.28
                col = (
                    int(dark[0] * (1 - mix) + accent[0] * mix),
                    int(dark[1] * (1 - mix) + accent[1] * mix),
                    int(dark[2] * (1 - mix) + accent[2] * mix),
                )
        else:
            mix = ratio * 0.35
            alpha = 255
            col = (
                int(dark[0] * (1 - mix) + accent[0] * mix),
                int(dark[1] * (1 - mix) + accent[1] * mix),
                int(dark[2] * (1 - mix) + accent[2] * mix),
            )
        odraw.line([(0, y), (W, y)], fill=(*col, max(0, min(255, alpha))))

    canvas = Image.alpha_composite(base, overlay)
    draw = ImageDraw.Draw(canvas)

    # Top bar: brand badge + slide counter
    draw.rounded_rectangle([72, 64, 72 + max(240, len(brand_name) * 16 + 44), 116], radius=26, fill=(*accent, 235))
    draw.text((96, 77), brand_name[:28], font=f_tag, fill=light)

    counter_text = f"{idx + 1:02d} / {total:02d}"
    draw.rounded_rectangle([W - 196, 64, W - 72, 116], radius=26, fill=(18, 17, 16, 210), outline=(*accent_text, 180), width=2)
    draw.text((W - 168, 77), counter_text, font=f_num, fill=light)

    # Content card in lower half
    card_top = 690 if photos else 380
    draw.rounded_rectangle([64, card_top, W - 64, 1185], radius=28, fill=(18, 17, 16, 232), outline=(*accent_text, 160), width=2)

    role_label = (page.get("roleLabel") or f"SLIDE {idx + 1}").upper()
    draw.text((108, card_top + 38), role_label, font=f_tag, fill=accent_text)

    headline = (page.get("headline") or "").strip()
    body = (page.get("body") or "").strip()

    y_cursor = card_top + 82
    for line in textwrap.wrap(headline, width=26)[:4]:
        draw.text((108, y_cursor), line, font=f_head, fill=light)
        y_cursor += 64

    y_cursor += 18
    for line in textwrap.wrap(body, width=42)[:6]:
        draw.text((108, y_cursor), line, font=f_body, fill=(228, 228, 231))
        y_cursor += 44

    # Footer: official logo + CTA / swipe hint
    if logo_path and os.path.isfile(logo_path):
        try:
            lg = Image.open(logo_path).convert("RGBA")
            lg.thumbnail((160, 56), Image.Resampling.LANCZOS)
            canvas.paste(lg, (72, 1228), lg)
        except Exception:
            pass

    cta_hint = "Salve e compartilhe ↗" if idx == total - 1 else "Deslize para continuar →"
    draw.text((W - 380, 1242), cta_hint, font=f_footer, fill=accent_text)

    out_file = os.path.join(out_dir, f"slide-{idx + 1:02d}.png")
    canvas.convert("RGB").save(out_file, "PNG", optimize=True)
    print(f"RENDERED:{out_file}")
`;

export async function postnowRuntimeStatus(services: Services): Promise<{ pythonVersion?: string; pillowVersion?: string }> {
  try {
    const python = await findPillowPython(services);
    const env = await toolEnvironment(services);
    const [versionResult, pillowResult] = await Promise.all([
      services.capture(python, ['--version'], { cwd: services.dataDir, env, timeoutMs: 15000 }),
      services.capture(python, ['-c', 'import PIL; print(PIL.__version__)'], { cwd: services.dataDir, env, timeoutMs: 15000 }),
    ]);
    const pythonVersion = (versionResult.stdout + '\n' + versionResult.stderr).match(/\b(\d+\.\d+(?:\.\d+)?)/)?.[1];
    const pillowVersion = pillowResult.code === 0 ? pillowResult.stdout.trim().match(/^\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?$/)?.[0] : undefined;
    return { pythonVersion, pillowVersion };
  } catch { return {}; }
}

async function findPillowPython(services: Services): Promise<string> {
  const postnowRoot = services.getSettings().enginePaths.postnow;
  if (postnowRoot) {
    const venvPy = join(postnowRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    try {
      if ((await stat(venvPy)).isFile()) return venvPy;
    } catch { /* try next */ }
  }
  const versionsDir = join(services.dataDir, 'engines', 'postnow', 'versions');
  try {
    for (const entry of await readdir(versionsDir)) {
      const candidate = join(versionsDir, entry, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch { /* continue */ }
    }
  } catch { /* fallback to system python */ }
  const py = await resolveTool('python', services);
  if (!py) throw new Error('Python não encontrado. Instale o motor PostNow em Motores & Setup.');
  return py;
}

function splitSlideCopy(rawCopy: string, fallbackTitle: string, index: number, total: number): { roleLabel: string; headline: string; body: string } {
  const cleaned = rawCopy.trim();
  const roleLabel = index === 0 ? 'CAPA · GANCHO' : index === total - 1 ? 'CONCLUSÃO & CTA' : `PONTO ${index}`;
  if (!cleaned) {
    return {
      roleLabel,
      headline: fallbackTitle,
      body: 'Edite o briefing ou inicie uma sessão de IA com Codex ou Claude Code para personalizar o texto deste slide.',
    };
  }
  const lines = cleaned.split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return { roleLabel, headline: lines[0]!, body: lines.slice(1).join(' ') };
  }
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 2) {
    return { roleLabel, headline: sentences[0]!, body: sentences.slice(1).join(' ') };
  }
  return { roleLabel, headline: cleaned.slice(0, 90), body: cleaned.length > 90 ? cleaned.slice(90) : '' };
}

function synthesizeDefaultPages(project: Project, brand?: Brand): Array<{ page: number; role: string; headline: string; body: string; copy: string; visual_function: string; prompt_file: string }> {
  const topic = (project.brief || project.title).trim();
  const count = 5;
  const templates = [
    {
      role: 'cover',
      headline: project.title,
      body: topic || `Guia prático com ${brand?.name || 'identidade visual consistente'}.`,
    },
    {
      role: 'body',
      headline: '1. O primeiro passo exige clareza e acolhimento',
      body: `Quando o assunto é ${topic.toLowerCase()}, informação clara reduz a ansiedade e evita decisões precipitadas.`,
    },
    {
      role: 'body',
      headline: '2. Organização protege o que realmente importa',
      body: 'Reunir documentos, alinhar expectativas e conhecer seus direitos transforma um momento difícil em um processo seguro.',
    },
    {
      role: 'body',
      headline: '3. Diálogo e orientação técnica caminham juntos',
      body: 'Cada caso tem sua história. Uma condução leve e estratégica economiza tempo, desgaste emocional e recursos.',
    },
    {
      role: 'cta',
      headline: 'Ficou com alguma dúvida sobre o seu caso?',
      body: `Salve este carrossel para consultar depois e envie para quem precisa de orientação segura com ${brand?.name || 'especialista'}.`,
    },
  ];
  return templates.slice(0, count).map((item, idx) => ({
    page: idx + 1,
    role: item.role,
    headline: item.headline,
    body: item.body,
    copy: `${item.headline}\n${item.body}`,
    visual_function: 'Slide editorial 1080x1350 com foto de referência e paleta da marca.',
    prompt_file: `prompts/${String(idx + 1).padStart(2, '0')}.md`,
  }));
}
export async function renderCarousel(project: Project, brand: Brand | undefined, services: Services): Promise<Job> {

  const python = await findPillowPython(services);
  const env = await toolEnvironment(services);
  const pillow = await services.capture(python, ['-c', 'import PIL'], { cwd: project.path, env, timeoutMs: 15000 });
  if (pillow.code !== 0) throw new Error('O renderizador de carrossel precisa do Pillow. Instale o motor PostNow em Motores & Setup ou vincule uma instalação com Pillow.');
  const projectJsonPath = join(project.path, 'project.json');
  const native = object(await readJson(projectJsonPath), 'Projeto PostNow');
  let rawPages = Array.isArray(native.pages) ? native.pages.map(p => object(p, 'Página')) : [];
  const hasRealCopy = rawPages.some(p => typeof p.copy === 'string' && p.copy.trim().length > 0);
  if (!hasRealCopy || rawPages.length === 0) {
    const synthesized = synthesizeDefaultPages(project, brand);
    native.type = 'carousel';
    native.page_count = synthesized.length;
    native.pages = synthesized;
    await atomicJson(projectJsonPath, native);
    rawPages = synthesized;
  }

  const generatedDir = await directory(project.path, 'generated');
  const existingFiles = (await readdir(generatedDir)).sort();
  const userPhotos: string[] = [];
  for (const name of existingFiles) {
    if (/^slide-\d+\.png$/i.test(name)) continue;
    const ext = extname(name).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      userPhotos.push(join(generatedDir, name));
    }
  }
  if (brand?.references) {
    for (const ref of brand.references) {
      if (ref.kind === 'image') userPhotos.push(ref.path);
    }
  }

  const pages = rawPages.map((p, index) => {
    const headline = typeof p.headline === 'string' && p.headline.trim() ? p.headline.trim() : '';
    const body = typeof p.body === 'string' && p.body.trim() ? p.body.trim() : '';
    const copy = typeof p.copy === 'string' ? p.copy : '';
    if (headline) {
      return {
        roleLabel: index === 0 ? 'CAPA · GANCHO' : index === rawPages.length - 1 ? 'CONCLUSÃO & CTA' : `SLIDE 0${index + 1}`,
        headline,
        body: body || copy,
      };
    }
    return splitSlideCopy(copy, project.title, index, rawPages.length);
  });

  const specJson = JSON.stringify({
    projectDir: project.path,
    brandName: brand?.name || project.title,
    colors: brand?.colors?.length ? brand.colors : ['#F97316', '#121110', '#FAFAFA'],
    logo: brand?.logo,
    photos: userPhotos,
    pages,
  });

  return services.run({
    title: `PostNow: renderizando ${pages.length} slide(s) do carrossel`,
    executable: python,
    args: ['-c', `import sys; exec(${JSON.stringify(RENDER_SCRIPT)})`],
    cwd: project.path,
    env: { ...env, MDC_CAROUSEL_SPEC: specJson },
    projectId: project.id,
    timeoutMs: 5 * 60 * 1000,
  });
}
