import type { ProjectFormatId } from './contracts.js';
export type PromptKind = 'image' | 'video';

export interface PromptRecipe {
  id: string;
  title: string;
  kind: PromptKind;
  category: string;
  description: string;
  prompt: string;
}

export interface PersonalPrompt {
  id: string;
  title: string;
  kind: PromptKind;
  prompt: string;
  createdAt: string;
}

export interface PromptLibraryData {
  favorites: string[];
  personal: PersonalPrompt[];
}

export interface PromptInputs {
  topic: string;
  audience: string;
  tone: string;
  callToAction: string;
  format: ProjectFormatId;
  pageCount?: number;
}

export interface PromptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROMPT_LIBRARY_STORAGE_KEY = 'maquina-studio.prompt-library.v1';
export const PROMPT_RECIPES: PromptRecipe[] = [
  {
    id: 'curiosity-carousel', title: 'Curiosidade em carrossel', kind: 'image', category: 'Curiosidades',
    description: 'Gancho magnético, fatos verificáveis e área livre para aplicação da logo oficial.',
    prompt: 'Crie um carrossel de {{pageCount}} slides sobre {{topic}}. Estruture: slide 1 como capa, com um gancho específico, curioso e headline curta de 2 a 6 palavras; slides do meio, um fato verificável por slide, explicado em linguagem simples com body claro e espaço de respiro; último slide com síntese e CTA “{{callToAction}}”. ÁREA DA LOGO: reserve obrigatoriamente um canto inferior limpo, sem ilustrações nem pessoas (espaço negativo liso), para aplicação da logo oficial pelo PostNow. Entregue exatamente essa quantidade de slides. Para cada slide, escreva headline curta, body claro, copy completo e visual_function detalhado. Registre afirmações e fontes em research/claims.json; não invente fatos nem fontes.'
  },
  {
    id: 'collage-carousel', title: 'Colagem Editorial & Mixed Media', kind: 'image', category: 'Design & Colagem',
    description: 'Recortes fotográficos, blocos de cor na paleta e área limpa para a logo oficial.',
    prompt: 'Crie um carrossel de {{pageCount}} slides no estilo Colagem Editorial e Mixed Media sobre {{topic}} para {{audience}}. Direção visual: recortes de fotos reais da marca, sobreposição harmônica de blocos de cor na paleta oficial, texturas refinadas e tipografia com serifa de alto contraste. RESERVE ÁREA LIVRE: em cada página onde a logo for aplicada, garanta que o canto inferior direito tenha fundo limpo, liso e com respiro, sem ilustrações nem pessoas, para que a logo oficial tenha contraste e visibilidade perfeitos. Entregue exatamente essa quantidade de slides com headline curta (2 a 6 palavras), body envolvente, copy completo e visual_function com direção de arte detalhada.'
  },
  {
    id: 'authority-guide-carousel', title: 'Guia Prático & Autoridade', kind: 'image', category: 'Autoridade & Guias',
    description: 'Etapas sequenciais com hierarquia visual impecável e área livre para a marca.',
    prompt: 'Crie um carrossel de {{pageCount}} slides com um guia prático ou passo a passo sobre {{topic}} para {{audience}}, em tom {{tone}}. Estrutura: capa com promessa clara de transformação e headline de alto impacto; slides centrais numerados com uma orientação prática por página, cartões limpos e diagramas de processo; slide final com checklist resumo e CTA “{{callToAction}}”. VISIBILIDADE DA LOGO: certifique-se de que o canto inferior seja mantido com fundo uniforme e livre de textos ou desenhos, garantindo a perfeita visibilidade da logo oficial aplicada pelo PostNow. Entregue exatamente essa quantidade de slides com headline, body, copy e visual_function.'
  },
  {
    id: 'image-framework-carousel', title: 'Método & Framework Exclusivo', kind: 'image', category: 'Autoridade & Guias',
    description: 'Apresenta um método próprio com diagramas visuais e alta retenção.',
    prompt: 'Crie um carrossel de {{pageCount}} slides apresentando o método ou framework definitivo sobre {{topic}} para {{audience}}, em tom {{tone}}. Estruture: slide 1 com nome forte do método e promessa de clareza; slides centrais detalhando cada pilar com diagramas visuais explicativos e exemplos concretos; slide final com aplicação prática e chamada “{{callToAction}}”. ÁREA LIVRE DA LOGO: preserve o canto inferior direito como espaço negativo liso na cor da paleta, sem gráficos por baixo, para que o PostNow aplique a logo com nitidez total. Entregue exatamente essa quantidade de slides com headline curta (2 a 6 palavras), copy e fontes em research/claims.json.'
  },
  {
    id: 'myth-fact-carousel', title: 'Mito ou fato?', kind: 'image', category: 'Curiosidades',
    description: 'Desmonta uma crença popular com contexto, evidências e respiro visual.',
    prompt: 'Crie um carrossel de {{pageCount}} slides “mito ou fato?” sobre {{topic}} para {{audience}}. Slide 1 como capa: a crença apresentada como pergunta provocativa. Slides do meio: um fato verificável por slide, cobrindo o veredito com contexto, por que o mito parece plausível e a evidência comprovada. Último slide: conclusão útil e CTA “{{callToAction}}”. ÁREA LIVRE: deixe o canto inferior com espaço negativo limpo para aplicação da logo oficial pelo PostNow. Entregue exatamente essa quantidade de slides. Cada slide deve ter headline (2 a 6 palavras), body, copy e visual_function. Documente afirmações e fontes em research/claims.json.'
  },
  {
    id: 'image-dark-mode-carousel', title: 'Modo Escuro & Alto Contraste', kind: 'image', category: 'Design & Colagem',
    description: 'Estética dark mode premium com acentos vibrantes na paleta da marca e espaço negativo.',
    prompt: 'Crie um carrossel de {{pageCount}} slides no estilo Dark Mode de Alto Contraste sobre {{topic}} para {{audience}}. Composição: fundo escuro profundo, tipografia nítida e acentos luminosos na cor primária da marca. Destaque palavras-chave e números com hierarquia precisa. ÁREA DE RESPIRO: reserve o canto inferior direito com fundo escuro liso e sem desenhos para sobreposição da logo oficial pelo PostNow com máxima legibilidade. Entregue exatamente essa quantidade de slides com headline de 2 a 6 palavras, body, copy e visual_function.'
  },
  {
    id: 'top-five-carousel', title: 'Fatos surpreendentes', kind: 'image', category: 'Listas',
    description: 'Lista visual com ritmo crescente, espaço negativo e conclusão útil.',
    prompt: 'Crie um carrossel de {{pageCount}} slides com curiosidades verificáveis sobre {{topic}} para {{audience}}: capa com gancho magnético, um fato independente por slide nos slides centrais e fechamento com resumo e CTA “{{callToAction}}”. Evite sobrecarregar os slides: use espaço negativo amplo e garanta área livre no canto inferior para a aplicação da logo oficial sem sobrepor a arte. Entregue exatamente essa quantidade de slides. Preencha headline curta, body, copy e visual_function por página. Registre fatos e fontes confiáveis em research/claims.json.'
  },
  {
    id: 'video-collage-motion', title: 'Colagem Dinâmica & Mixed Media', kind: 'video', category: 'Colagem & Motion',
    description: 'Colagem com recortes de fotos reais, formas geométricas, sonoplastia e trilha.',
    prompt: 'Crie um Reels de 30 a 45 segundos sobre {{topic}} para {{audience}}, em tom {{tone}}, no estilo Colagem Dinâmica e Mixed Media. Estruture 4 a 6 cenas: gancho rápido (até 3s), contexto, desenvolvimento em pontos claros e encerramento com CTA “{{callToAction}}”. DIREÇÃO VISUAL: use colagem contemporânea com formas geométricas na paleta da marca, recortes de fotos reais disponíveis da marca (use kind "image" apontando para assets/brand/ em pelo menos 1 cena de autoridade), diagramas visuais (layout "process" ou "evidence") e tipografia cinética. TEXTO NA TELA (onScreen): use frases curtas, normais e ritmadas (2 a 4 palavras por beat); NUNCA cole a pergunta inteira do gancho nem repita a narração verbatim na tela. SONOPLASTIA E TRILHA: planeje efeitos sonoros pontuais em cada cena (whoosh em transições, kick no gancho, tick nos tópicos) e trilha sonora de fundo contínua com ducking sob a voz (volume 0.15). NARRAÇÃO: escreva narration natural e spokenText com tags ElevenLabs v4 ([curious], [thoughtful], [excited]), sem SSML; use IPA entre barras apenas em spokenText para nomes de pronúncia ambígua. Apenas prepare roteiro e storyboard: não gere áudio, não publique e não renderize sem a ação explícita e revisão humana da narração.'
  },
  {
    id: 'video-3d-justice', title: 'Tribunal & Explainer 3D', kind: 'video', category: 'Direito & Fatos',
    description: 'Abertura reflexiva, cena 3D procedural da balança da justiça e autoridade profissional.',
    prompt: 'Crie um vídeo vertical de 30 a 45 segundos sobre {{topic}} para {{audience}}, em tom {{tone}}, com foco em segurança jurídica e clareza. Estruture 4 a 6 cenas: gancho provocativo, definição do conceito com cena 3D procedural da balança da justiça (kind "3d" com compositionId "justice"), exemplos práticos da lei com diagrama visual (kind "diagram", layout "process"), momento de autoridade com foto real da profissional no escritório (kind "image" em assets/brand/) e fechamento acolhedor com CTA “{{callToAction}}”. TEXTO EM TELA (onScreen): títulos curtos e dinâmicos de 2 a 4 palavras, destacando palavras-chave no tempo da fala sem duplicar a locução. SOM: configure trilha ambiente contínua com ducking sob a voz e efeitos sonoros whoosh nas passagens de cena e blip-up nos destaques legais. Preencha narration e spokenText com tags Eleven v4; use IPA entre barras em spokenText quando necessário. Apenas prepare roteiro e storyboard: não gere áudio nem renderize antes da revisão humana.'
  },
  {
    id: 'video-3d-technology', title: 'Tecnologia & Smartphone 3D', kind: 'video', category: 'Tecnologia & Inovação',
    description: 'Composição 3D com smartphone/notificações ou dados, diagramas de fluxo e ritmo veloz.',
    prompt: 'Crie um vídeo vertical de 30 a 45 segundos sobre {{topic}} para {{audience}}, em tom {{tone}}, com estética tech moderna. Estrutura de 4 a 6 cenas: gancho nos primeiros 2s com pergunta direta sobre impacto digital; cena 3D procedural de smartphone ou notificações (kind "3d" com compositionId "phone") ou dados/linha do tempo (compositionId "timeline"); demonstração com diagrama visual (layout "process" ou "interface"); fechamento direto com CTA “{{callToAction}}”. TEXTOS EM TELA (onScreen): palavras-chave objetivas de 2 a 4 palavras que reforçam a narrativa sem poluição. SOM: efeitos sonoros digitais (blip, tick, whoosh) e trilha tech contínua com ducking sob a voz. Narração com tags Eleven v4; use IPA entre barras apenas em spokenText. Apenas prepare roteiro e storyboard: não gere áudio nem renderize antes da aprovação humana.'
  },
  {
    id: 'video-authority-reels', title: 'Reels de Autoridade com Foto Autoral', kind: 'video', category: 'Autoridade',
    description: 'Conexão humana, fotos reais da pessoa com Ken Burns contínuo e ritmo ágil.',
    prompt: 'Crie um Reels vertical de alta retenção sobre {{topic}} para {{audience}}, em tom {{tone}}. Estruture de 4 a 5 cenas: gancho forte que conecta com a dor do espectador, dois pontos práticos de orientação e fechamento com CTA “{{callToAction}}”. DIREÇÃO VISUAL: intercale cenas de tipografia cinética refinada sobre fundo da marca e cenas com fotos reais da pessoa (kind "image" apontando para assets/brand/) com aproximação contínua (camera "push-in"). TEXTOS EM TELA: frases curtas, normais e impactantes que complementam a fala sem repetir a narração. ÁUDIO: narração expressiva com tags Eleven v4, trilha de fundo sutil com ducking e efeitos sonoros orgânicos de transição (whoosh) e ênfase (kick/blip). Apenas prepare roteiro e storyboard: não gere áudio nem renderize antes da aprovação humana.'
  },
  {
    id: 'video-vox-explainer', title: 'Explicador Documental estilo Vox', kind: 'video', category: 'Documentário & Análise',
    description: 'Jornalismo investigativo rápido: pergunta instigante, evidências na tela e diagramas.',
    prompt: 'Crie um vídeo explicador documental de até 45 segundos sobre {{topic}} para {{audience}}, em tom {{tone}}, inspirado no formato jornalístico do Vox. Estruture 4 a 6 cenas: cena 1 abre com uma pergunta intrigante baseada em dados; cenas 2 e 3 trazem evidências factuais com diagramas estruturados (layout "evidence" ou "statistics"); cena 4 expõe a virada ou causa raiz oculta (purpose "turn"); cena 5 traz o desfecho analítico e CTA “{{callToAction}}”. TEXTOS EM TELA (onScreen): dados, datas e palavras de ancoragem concisas de 2 a 4 palavras. ÁUDIO: trilha documental contínua com ducking sob a voz, efeitos sonoros pontuais de transição. Narração natural com tags Eleven v4; use IPA entre barras apenas em spokenText quando necessário. Apenas prepare roteiro e storyboard: não gere áudio nem renderize sem revisão.'
  },
  {
    id: 'curiosity-video-30', title: 'Curiosidade em 30 segundos', kind: 'video', category: 'Curiosidades',
    description: 'Reels curto com gancho rápido, ritmo visual, SFX e trilha com ducking.',
    prompt: 'Crie um vídeo vertical de aproximadamente 30 segundos sobre {{topic}} para {{audience}}, em tom {{tone}}. Monte 4–6 cenas no storyboard do VideoGo: gancho nos primeiros 2 segundos, desenvolvimento em fatos verificáveis, virada narrativa e CTA “{{callToAction}}”. TEXTO EM TELA (onScreen): use frases curtas e ritmadas (2 a 4 palavras por beat); NUNCA cole a pergunta inteira do gancho nem repita a narração na tela. SONOPLASTIA E TRILHA: planeje efeitos sonoros em audio.sfx (array de strings com notas de sonoplastia, ex.: ["whoosh", "kick", "tick"]; mantenha audio.sfxCues como [] até que arquivos de som reais existam) e trilha de fundo contínua com ducking sob a voz (volume 0.15). NARRAÇÃO: preencha narration natural e spokenText com tags ElevenLabs v4 ([curious], [excited], [whispers]), sem SSML; use IPA entre barras apenas em spokenText para nomes de pronúncia ambígua. Registre afirmações e fontes em planning/sources e claims em research/claims.json. Apenas prepare roteiro e storyboard: não gere áudio, não publique e não renderize sem a ação explícita e revisão humana da narração.'
  },
  {
    id: 'myth-fact-video', title: 'Mito ou verdade em vídeo', kind: 'video', category: 'Curiosidades',
    description: 'Roteiro de até 45s que responde uma dúvida com comparação visual e sonoplastia.',
    prompt: 'Escreva um Reels de até 45 segundos sobre “mito ou verdade: {{topic}}”, para {{audience}}, em tom {{tone}}. Cena 1 apresenta a dúvida com impacto; cenas seguintes dão o veredito com diagrama de comparação (layout "comparison") e som de impacto (kick), explicam o contexto e mostram a evidência; a última resume e convida à conversa com “{{callToAction}}”. TEXTO EM TELA: termos objetivos e enxutos (2 a 4 palavras por cena) no ritmo da fala. SOM: trilha sonora contínua com ducking sob a voz e efeitos sonoros de transição em cada corte (whoosh). Preencha cenas válidas do storyboard VideoGo com narration, spokenText com tags Eleven v4, duração e direção visual; use IPA entre barras apenas em spokenText quando necessário. Apenas prepare roteiro e storyboard: não gere áudio nem renderize antes da aprovação humana.'
  },
  {
    id: 'three-facts-video', title: '3 fatos em 3 cenas', kind: 'video', category: 'Listas',
    description: 'Três descobertas rápidas com cartões que entram na batida e deixas de áudio.',
    prompt: 'Crie um vídeo vertical curto com três pontos ou curiosidades verificáveis sobre {{topic}} para {{audience}}, em tom {{tone}}. Use abertura com gancho rápido, três cenas numeradas com cartões visuais (layout "process" ou "evidence") e fechamento com “{{callToAction}}”. TEXTOS EM TELA: tópicos curtos de 2 a 4 palavras por cartão, sem repetir a fala. ÁUDIO E SOM: planeje efeitos sonoros sincronizados (whoosh nas trocas, tick/blip em cada item) e trilha de fundo com ducking. Para cada cena, preencha narration, spokenText (com tags Eleven v4), direção visual, duração e texto em tela; use IPA entre barras apenas em spokenText quando necessário. Evite afirmações sensacionalistas e registre fontes em planning/sources. Não gere áudio nem renderize até a pessoa revisar e aprovar a narração.'
  },
];

export function promptRecipesFor(kind: PromptKind, carousel: boolean): PromptRecipe[] {
  if (kind === 'video') return PROMPT_RECIPES.filter(recipe => recipe.kind === 'video');
  return carousel ? PROMPT_RECIPES.filter(recipe => recipe.kind === 'image') : [];
}

const validKind = (value: unknown): value is PromptKind => value === 'image' || value === 'video';
const nonEmpty = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function emptyPromptLibrary(): PromptLibraryData { return { favorites: [], personal: [] }; }

export function parsePromptLibrary(raw: string | null): PromptLibraryData {
  if (!raw) return emptyPromptLibrary();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyPromptLibrary();
    const candidate = parsed as Record<string, unknown>;
    const personal = Array.isArray(candidate.personal)
      ? candidate.personal.filter((item): item is PersonalPrompt => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
          const prompt = item as Record<string, unknown>;
          return nonEmpty(prompt.id, 80) && nonEmpty(prompt.title, 80) && validKind(prompt.kind) && nonEmpty(prompt.prompt, 20000) && typeof prompt.createdAt === 'string';
        }).slice(0, 200)
      : [];
    const allowedIds = new Set([...PROMPT_RECIPES.map(recipe => recipe.id), ...personal.map(prompt => prompt.id)]);
    const favorites = Array.isArray(candidate.favorites)
      ? [...new Set(candidate.favorites.filter((id): id is string => typeof id === 'string' && allowedIds.has(id)))].slice(0, 206)
      : [];
    return { favorites, personal };
  } catch { return emptyPromptLibrary(); }
}

export function loadPromptLibrary(storage: PromptStorage): PromptLibraryData {
  try { return parsePromptLibrary(storage.getItem(PROMPT_LIBRARY_STORAGE_KEY)); }
  catch { return emptyPromptLibrary(); }
}

export function savePromptLibrary(data: PromptLibraryData, storage: PromptStorage): boolean {
  try {
    storage.setItem(PROMPT_LIBRARY_STORAGE_KEY, JSON.stringify(parsePromptLibrary(JSON.stringify(data))));
    return true;
  } catch { return false; }
}

const FORMAT_DESCRIPTIONS: Record<ProjectFormatId, string> = {
  'post-1x1': 'post quadrado 1:1, 1080 × 1080 px',
  'carousel-1x1': 'carrossel quadrado 1:1, 1080 × 1080 px',
  'post-4x5': 'post vertical 4:5, 1080 × 1350 px',
  'carousel-4x5': 'carrossel vertical 4:5, 1080 × 1350 px',
  'post-4x3': 'post vertical 4:5, 1080 × 1350 px',
  'carousel-4x3': 'carrossel vertical 4:5, 1080 × 1350 px',
  'story-9x16': 'Story 9:16, 1080 × 1920 px',
  reels: 'Reels/Shorts/TikTok 9:16, 1080 × 1920 px',
  story: 'Story/Status 9:16, 1080 × 1920 px',
  'feed-square': 'Feed quadrado 1:1, 1080 × 1080 px',
  youtube: 'YouTube 16:9, 1920 × 1080 px',
};
export function formatDescription(format: ProjectFormatId): string {
  return FORMAT_DESCRIPTIONS[format];
}
export function composePrompt(recipe: PromptRecipe, input: PromptInputs): string {
  return `${interpolatePrompt(recipe.prompt, input)}\n\nFormato obrigatório: ${formatDescription(input.format)}. Respeite proporção, dimensões e áreas seguras; não converta para outro formato.`;
}

export function interpolatePrompt(template: string, input: PromptInputs): string {
  const values: Record<keyof PromptInputs, string> = {
    topic: input.topic.trim() || 'tema a definir',
    audience: input.audience.trim() || 'público geral',
    tone: input.tone.trim() || 'claro e curioso',
    callToAction: input.callToAction.trim() || 'salve e compartilhe',
    format: formatDescription(input.format),
    pageCount: typeof input.pageCount === 'number' && Number.isInteger(input.pageCount) && input.pageCount > 0 ? String(input.pageCount) : 'a definir',
  };
  const aliases: Record<string, keyof PromptInputs> = {
    topic: 'topic', tema: 'topic', assunto: 'topic',
    audience: 'audience', publico: 'audience',
    tone: 'tone', tom: 'tone',
    calltoaction: 'callToAction', call_to_action: 'callToAction', cta: 'callToAction', chamada: 'callToAction',
    format: 'format', formato: 'format',
    pagecount: 'pageCount', paginas: 'pageCount', slides: 'pageCount',
  };
  return template.replace(/\{\{([^{}]+)\}\}/g, (_, placeholder: string) => {
    const alias = placeholder.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const key = aliases[alias];
    return key ? values[key] : `{{${placeholder}}}`;
  });
}

export function suggestProjectTitle(kind: PromptKind, topic: string): string {
  const subject = topic.trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!subject) return '';
  return `${kind === 'image' ? 'Carrossel' : 'Vídeo'} — ${subject}`;
}

export function composeProjectBrief(input: PromptInputs, additionalNotes = ''): string {
  return [
    `Tema: ${input.topic.trim()}`,
    input.audience.trim() ? `Público: ${input.audience.trim()}` : '',
    input.tone.trim() ? `Tom: ${input.tone.trim()}` : '',
    input.callToAction.trim() ? `Chamada final: ${input.callToAction.trim()}` : '',
    `Formato: ${formatDescription(input.format)} (${input.format})`,
    additionalNotes.trim(),
  ].filter(Boolean).join('\n');
}
