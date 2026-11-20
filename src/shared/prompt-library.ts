import type { ProjectFormatId, VisualStyle } from './contracts.js';
export type PromptKind = 'image' | 'video';

export interface PromptRecipe {
  id: string;
  title: string;
  kind: PromptKind;
  category: string;
  description: string;
  prompt: string;
  /** Versão para post único ou Story (receitas de imagem); sem ela a receita usa `prompt` em qualquer formato. */
  singlePrompt?: string;
  /** Direção visual da receita, enviada direto à geração e ao PostNow (sem passar pela paráfrase do agente). */
  visualDirection?: string;
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
  useBrandImages?: boolean;
}

export interface PromptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROMPT_LIBRARY_STORAGE_KEY = 'maquina-studio.prompt-library.v1';
/** Preserves full-bleed composition; reserves logo space only when the saved project preference includes it. */
const LOGO_AREA = 'A arte preenche todo o quadro até as quatro bordas, sem faixa, rodapé ou moldura vazia. Respeite somente a preferência de logo já salva no projeto; se a logo oficial será aplicada depois, deixe uma pequena área integrada no canto inferior direito. Se a preferência for sem logo, componha até as bordas.';
const IMAGE_CONTENT_RULES = 'Escreva para {{audience}}, em tom {{tone}}. Uma ideia principal por página, texto legível e hierarquia clara. Para arte única, entregue somente headline curta e body/subtítulo conciso na imagem; coloque listas, dicas, etapas, detalhes, fontes, ressalvas e CTA completo em copy/caption de publicação, fora da arte. Para carrossel, distribua headline, body, copy e visual_function por slide, preservando conteúdo útil em cada página. {{brandImagePolicy}} Não invente fatos: registre afirmações factuais e fontes em research/claims.json. ' + LOGO_AREA;
function imageRecipe(id: string, title: string, category: string, description: string, carousel: string, single: string, visualDirection: string): PromptRecipe {
  return {
    id, title, kind: 'image', category, description, visualDirection,
    prompt: `Crie um carrossel sobre {{topic}}. ${carousel} ${IMAGE_CONTENT_RULES} Entregue exatamente {{pageCount}} slides, com sequência coerente e CTA “{{callToAction}}” no encerramento.`,
    singlePrompt: `Crie exatamente uma única arte sobre {{topic}} para {{format}}. ${single} Na arte, escreva apenas um headline curto e um body/subtítulo conciso, sem listas, passos, dicas detalhadas, fontes, ressalvas longas ou CTA de publicação; entregue o restante como copy/caption de publicação separada. Inclua a chamada “{{callToAction}}” somente na copy/caption, nunca na arte. ${IMAGE_CONTENT_RULES} Não crie carrossel, sequência, páginas extras nem instruções de publicação.`,
  };
}
const VIDEO_OUTPUT_RULES = 'Crie somente roteiro/storyboard para VideoGo, sem gerar áudio nem renderizar. Entregue storyboard válido no formato já usado pelo projeto. Em cada cena, escreva narration e spokenText com as mesmas palavras faladas, onScreen conciso que complemente (não transcreva) a fala, duration e visual coerentes; use tags de locução Eleven v4 e IPA apenas em spokenText quando necessário. Planeje audio.sfx como notas e mantenha sfxCues vazio sem arquivos reais; trilha discreta sob a voz. {{brandImagePolicy}} Nunca invente capturas, clientes, depoimentos, dados, logotipos ou resultados. Inclua fontes verificáveis para afirmações factuais.';
function videoRecipe(id: string, title: string, category: string, description: string, structure: string, visualDirection: string): PromptRecipe {
  return {
    id, title, kind: 'video', category, description, visualDirection,
    prompt: `Crie somente roteiro/storyboard para VideoGo sobre {{topic}}, para {{audience}}, em tom {{tone}}, no formato {{format}}. Estrutura: ${structure} Feche com uma ação clara: “{{callToAction}}”. Abra com situação, benefício ou pergunta específica que o vídeo realmente responde; cada cena deve avançar a ideia, sem clickbait ou repetição. ${VIDEO_OUTPUT_RULES}`,
  };
}

export const PROMPT_RECIPES: PromptRecipe[] = [
  imageRecipe('problem-solution-image', 'Problema e caminho prático', 'Educação & solução', 'Apresenta uma dificuldade reconhecível e um próximo passo realista.',
    'Capa: nomeie o problema sem exagero. Desenvolva sinais ou causas distintos, ações práticas e uma ressalva importante. Feche com resumo acionável.',
    'Mostre uma dificuldade concreta, uma orientação aplicável e uma ressalva necessária, sem prometer resultado.',
    'Contraste visual entre situação e próximo passo; foco único e linguagem acolhedora.'),
  imageRecipe('authority-guide-carousel', 'Passo a passo', 'Educação', 'Ensina um procedimento em etapas, do pré-requisito à checagem final.',
    'Capa com objetivo; ordene etapas executáveis e pré-requisitos; mostre erro comum e prevenção; encerre com síntese.',
    'Mostre uma ação principal em passos enxutos e ordenados. Inclua pré-requisito ou limite para evitar instrução incompleta.',
    'Diagrama sequencial, números e cartões limpos, cada etapa distinguível.'),
  imageRecipe('curiosity-carousel', 'Fato, evidência e contexto', 'Educação & evidência', 'Apresenta um fato verificável e relevante ao tema, com evidência e contexto — não curiosidade aleatória ou clickbait.',
    'Capa com uma afirmação específica; apresente evidência e fonte, explique o contexto e a relevância prática; conclua com implicação ou pergunta.',
    'Destaque somente o headline curto do fato e um subtítulo breve; explique relevância e fonte na copy de publicação.',
    'Dado ou evidência em destaque, uma visualização central e contexto legível.'),
  imageRecipe('checklist-image', 'Checklist salvável', 'Utilidade', 'Transforma o assunto em uma lista prática para consulta posterior.',
    'Capa com situação de uso; distribua itens distintos por slide; encerre com critério para agir ou buscar orientação.',
    'Use headline curto que apresente a utilidade da lista e um subtítulo conciso; inclua a lista na copy de publicação.',
    'Checklist arejado: itens numerados, tipografia forte e um elemento visual simples por bloco.'),
  imageRecipe('faq-image', 'Pergunta frequente', 'Comunidade & dúvidas', 'Responde uma dúvida real com resposta direta e contexto útil.',
    'Capa com pergunta real; responda cedo; detalhe contexto e exceções em slides próprios; encerre com próximo passo.',
    'Use uma pergunta específica como headline e uma resposta curta como subtítulo; acrescente contexto e exceções na copy.',
    'Pergunta e resposta com hierarquia nítida; decoração subordinada à leitura.'),
  imageRecipe('comparison-image', 'Comparação para decidir', 'Decisão', 'Compara opções por critérios explícitos, sem declarar vencedor universal.',
    'Apresente a decisão; compare opções pelos mesmos critérios; explique para quem cada uma faz sentido; encerre com critério de escolha.',
    'Nomeie a decisão no headline e indique brevemente o critério no subtítulo; compare as opções na copy.',
    'Cartões simétricos e rótulos consistentes; não sugira superioridade sem evidência.'),
  imageRecipe('case-study-image', 'Caso real e aprendizado', 'Prova & confiança', 'Extrai aprendizado de experiência documentada, sem fabricar depoimento ou métrica.',
    'Apresente contexto verificável, ação, evidência disponível e aprendizado; diferencie fato, interpretação e limite do caso.',
    'Destaque o aprendizado no headline e o contexto em um subtítulo conciso; informe evidências e limites na copy.',
    'Narrativa em contexto, ação e aprendizado; prova visual só se fornecida e autorizada.'),
  imageRecipe('objection-image', 'Objeção respondida', 'Consideração', 'Responde hesitação comum sem pressão nem omissão de limites.',
    'Nomeie a objeção; responda com informação verificável; explique para quem a solução serve e não serve; termine sem pressão.',
    'Apresente uma objeção real como headline e uma resposta curta como subtítulo; detalhe limites e adequação na copy.',
    'Composição de pergunta e resposta, transparente e sem urgência artificial.'),
  imageRecipe('story-interaction-image', 'Story de conversa', 'Stories & comunidade', 'Uma única tela que convida a responder ou enviar uma dúvida.',
    'Apresente contexto; desenvolva uma pergunta ou escolha visual; encerre com pergunta que permita resposta específica.',
    'Crie uma única tela com contexto mínimo, uma pergunta específica e duas opções curtas. Não desenhe interface falsa de enquete; reserve espaço para inserir o sticker nativo depois.',
    'Story vertical com texto protegido das áreas de interface e espaço para sticker nativo.'),
  imageRecipe('product-feature-image', 'Produto em uso', 'Produto & serviço', 'Mostra uma função real em contexto, com condições e benefício concreto.',
    'Apresente necessidade; demonstre função real e benefício; informe condição ou limite relevante; encerre com CTA informativo.',
    'Destaque a função no headline e um benefício conciso no subtítulo; explique condições e limites na copy.',
    'Demonstração concreta e produto fiel ao material fornecido; sem selos ou especificações inventados.'),
  imageRecipe('point-of-view-image', 'Ponto de vista fundamentado', 'Marca & posicionamento', 'Expõe opinião com argumento, nuance e convite genuíno ao diálogo.',
    'Abra com tese clara; sustente com razões ou evidências; reconheça nuance; feche com pergunta genuína.',
    'Apresente uma tese curta no headline e sua razão em um subtítulo; desenvolva argumentos e nuance na copy.',
    'Tese em destaque e argumentos curtos; evite clichês virais.'),
  imageRecipe('myth-fact-carousel', 'Mito, evidência e contexto', 'Educação & evidência', 'Verifica uma crença real com evidência e contexto, sem forçar controvérsia.',
    'Apresente a crença; dê o veredito com fonte; explique por que ela parece plausível e qual nuance importa; conclua com orientação.',
    'Destaque uma crença relacionada ao tema e um veredito curto; evidência, contexto e fonte ficam na copy.',
    'Contraste visual entre alegação e evidência, com fonte legível e nuance.'),
  imageRecipe('collage-carousel', 'Colagem editorial', 'Direção de arte', 'Direção visual de colagem aplicável a temas úteis, não a um nicho específico.',
    'Organize a informação em uma sequência clara com exemplos e síntese final.',
    'Apresente uma única ideia com exemplo visual pertinente e CTA direto.',
    'Colagem mixed media, recortes de referência da marca se existirem, formas gráficas e tipografia legível.'),
  imageRecipe('image-framework-carousel', 'Framework explicado', 'Educação', 'Organiza um método real em partes compreensíveis, sem inventar método proprietário.',
    'Apresente nome ou objetivo do método fornecido; explique cada pilar e exemplo; finalize com aplicação e limite.',
    'Mostre um método real com seus pilares e aplicação. Se o briefing não trouxer método, organize a ideia sem atribuir nome proprietário.',
    'Diagrama de pilares nomeados, exemplos concretos e hierarquia simples.'),
  imageRecipe('image-dark-mode-carousel', 'Alto contraste e leitura rápida', 'Direção de arte', 'Composição de alto contraste para conteúdo informativo ou promocional.',
    'Estruture a informação em progressão legível, destacando apenas palavras e números essenciais.',
    'Destaque uma mensagem principal no headline e um subtítulo conciso; amplie a informação na copy.',
    'Fundo escuro apenas se melhorar contraste; acentos da paleta da marca, sem sacrificar legibilidade.'),
  imageRecipe('top-five-carousel', 'Lista prática', 'Listas & utilidade', 'Lista curta de decisões, erros ou ações pertinentes ao tema.',
    'Apresente a situação; liste pontos distintos com justificativa breve; termine com síntese, sem completar a contagem com itens fracos.',
    'Use headline curto sobre a utilidade da lista e subtítulo conciso; apresente recomendações e contexto na copy.',
    'Lista numerada com ritmo visual consistente e espaço para leitura.'),
  {
    id: 'video-problem-solution', title: 'Problema e solução em vídeo', kind: 'video', category: 'Educação & solução',
    description: 'Abre numa situação reconhecível, entrega orientação e conclui com próximo passo.',
    visualDirection: 'Alternância entre situação e orientação, com legendas curtas e visuais demonstrativos originais.',
    prompt: `Crie um vídeo sobre {{topic}} para {{audience}}, em tom {{tone}}, no formato {{format}}. Abra com dificuldade concreta; contextualize sem dramatizar; apresente duas ou três ações úteis e seus limites; conclua com uma ação única: “{{callToAction}}”. Sem promessas absolutas ou alarmismo. ${VIDEO_OUTPUT_RULES}`,
  },
  videoRecipe('video-how-to', 'Demonstração passo a passo', 'Educação', 'Mostra como fazer algo com começo, etapas e conclusão verificável.',
    'revele o objetivo; apresente pré-requisito; demonstre etapas em ordem com uma ação por cena; termine checando o resultado.',
    'Cenas demonstrativas e passos numerados; fotos aprovadas do processo se houver, senão ilustrações originais.'),
  videoRecipe('video-faq', 'Resposta a uma dúvida', 'Comunidade & dúvidas', 'Responde pergunta comum sem rodeios e acrescenta contexto importante.',
    'formule a pergunta; responda logo; explique contexto e exceção; convide a enviar uma dúvida específica.',
    'Apresentação direta; sem retrato autorizado, use tipografia e diagramas, nunca pessoa fictícia como porta-voz.'),
  videoRecipe('video-comparison', 'Comparativo para decidir', 'Decisão', 'Compara opções pelos mesmos critérios e ajuda a audiência a escolher.',
    'apresente a decisão; compare duas opções pelos mesmos critérios; explique para quem cada uma serve; conclua sem vencedor universal.',
    'Tela dividida simétrica e critérios rotulados; não invente números, interface ou dados.'),
  videoRecipe('video-case-study', 'Caso e aprendizado', 'Prova & confiança', 'Conta narrativa curta com evidência real e limites explícitos.',
    'contextualize caso documentado; mostre ação e evidência fornecidas; explique aprendizado e o que o caso não prova; convide a conhecer o processo.',
    'Use material real fornecido e autorizado; sem material, use exemplo hipotético rotulado, não depoimento inventado.'),
  videoRecipe('video-behind-scenes', 'Bastidores do processo', 'Marca & comunidade', 'Mostra etapas reais, decisões e resultado observável.',
    'mostre detalhe real do processo; explique uma decisão; revele resultado ou aprendizado; pergunte sobre o processo.',
    'Monte materiais reais da marca se disponíveis; sem eles, use ilustrações originais sem fingir bastidores reais.'),
  videoRecipe('video-product-demo', 'Demonstração de produto/serviço', 'Produto & serviço', 'Mostra função real, contexto de uso e próximo passo informativo.',
    'mostre necessidade; demonstre uma função; explique benefício e condição; finalize com CTA informativo, sem urgência artificial.',
    'Mostre o produto real se houver referência; sem ela, use gráficos conceituais e não invente embalagem, tela ou especificação.'),
  videoRecipe('video-myth-check', 'Mito, evidência e contexto', 'Educação & evidência', 'Verifica crença com fonte, nuance e conclusão responsável.',
    'apresente crença recorrente; dê o veredito inicial; mostre evidência e contexto; conclua com resposta qualificada.',
    'Contraste visual entre alegação e evidência com fonte legível; não fabrique estatística ou falsa controvérsia.'),
  videoRecipe('video-three-takeaways', 'Três aprendizados práticos', 'Listas & utilidade', 'Entrega três ideias distintas que a pessoa pode aplicar ou lembrar.',
    'prometa exatamente três aprendizados; entregue um por cena com exemplo; conecte-os em resumo; peça ação coerente.',
    'Cartões numerados com exemplo; sem fatos surpreendentes artificiais.'),
  videoRecipe('video-point-of-view', 'Opinião com argumento', 'Marca & posicionamento', 'Apresenta tese, argumentos e nuance sem fabricar debate.',
    'abra com tese específica; sustente com razões ou evidências; reconheça limite; encerre com pergunta genuína.',
    'Use retrato autorizado se houver; sem ele, use tipografia e diagramas, sem avatar inventado.'),
  videoRecipe('video-story', 'Mini-história com conclusão', 'Storytelling', 'Conta história curta com mudança e conclusão útil, sem arco artificial.',
    'estabeleça personagem ou situação real fornecida; mostre obstáculo; revele mudança observável; conclua com aprendizado.',
    'História hipotética deve ser rotulada; não apresente ficção como testemunho real.'),
  videoRecipe('video-collage-motion', 'Colagem editorial em movimento', 'Direção de arte', 'Colagem e tipografia cinética sem exigir fotos de marca.',
    'abra com cena forte; explique tema em progressão; conclua com aplicação e CTA.',
    'Colagem original com referência da marca somente se houver; sem referência, use formas e paleta do briefing.'),
  videoRecipe('video-3d-justice', 'Explainer visual', 'Educação', 'Explica um conceito com analogia visual e exemplo pertinente ao briefing.',
    'apresente conceito; explique em analogia visual; mostre exemplo; encerre com resumo e CTA.',
    'Use animação 3D apenas se tornar o conceito mais claro; não imponha balança da justiça ou tema jurídico.'),
  videoRecipe('video-3d-technology', 'Demonstração visual de processo', 'Educação & demonstração', 'Usa diagramas ou 3D quando ajudam a explicar etapas.',
    'mostre resultado; decomponha o processo em etapas; esclareça dúvida/limite; feche com ação útil.',
    'Use interface, smartphone ou 3D somente se o tema exigir; não invente telas nem notificações.'),
  videoRecipe('video-authority-reels', 'Orientação profissional', 'Confiança', 'Compartilha orientação clara sem depender de retrato ou promessa de autoridade.',
    'apresente pergunta do público; responda com experiência ou fonte; dê duas ações e um limite; convide a conversa.',
    'Retrato real autorizado se disponível; sem retrato, narração e recursos visuais originais.'),
  videoRecipe('video-vox-explainer', 'Explicador com evidências', 'Educação & análise', 'Explica causa, consequência e evidência, sem imitar uma marca editorial.',
    'apresente pergunta; mostre evidências verificadas; conecte causa e consequência; sintetize e convide a explorar o tema.',
    'Diagramas simples, fonte de cada dado na tela e ritmo documental; não invente números.'),
  videoRecipe('curiosity-video-30', 'Fato útil em vídeo curto', 'Educação & evidência', 'Um fato ligado ao tema e explicado em contexto, sem curiosidade aleatória.',
    'abra com a relevância do fato; mostre evidência; explique contexto e aplicação; feche com uma pergunta específica.',
    'Use visualização simples da evidência; nada de ganchos que prometam revelação não entregue.'),
  videoRecipe('myth-fact-video', 'Mito, evidência e contexto', 'Educação & evidência', 'Responde crença real com comparação e fonte.',
    'apresente crença; dê veredito; explique contexto e evidência; conclua com orientação qualificada.',
    'Diagrama comparativo legível; cite fonte e não force falsa controvérsia.'),
  videoRecipe('three-facts-video', 'Três pontos úteis', 'Listas & utilidade', 'Organiza três ideias relevantes sem completar lista com curiosidade solta.',
    'prometa três pontos; apresente um argumento ou ação por cena; feche com resumo e CTA.',
    'Cartões numerados e um exemplo por ponto; fatos sustentados por fontes.'),
];

/** Receitas separadas por tipo; imagem usa molde de arte única ou carrossel conforme o formato. */
export function promptRecipesFor(kind: PromptKind): PromptRecipe[] {
  return PROMPT_RECIPES.filter(recipe => recipe.kind === kind);
}

/** Direção visual de uma receita com direção, como o projeto a grava; undefined quando o id não é uma receita desse tipo. */
export function visualStyleFor(id: unknown, kind: PromptKind = 'image'): VisualStyle | undefined {
  const recipe = typeof id === 'string' ? PROMPT_RECIPES.find(item => item.id === id) : undefined;
  return recipe?.kind === kind && recipe.visualDirection ? { id: recipe.id, title: recipe.title, direction: recipe.visualDirection } : undefined;
}

/** Estilos prontos do vídeo: as receitas de vídeo que definem uma direção visual. */
export function videoStyles(): VisualStyle[] {
  return PROMPT_RECIPES.flatMap(recipe => (recipe.kind === 'video' ? visualStyleFor(recipe.id, 'video') ?? [] : []));
}

export const MAX_CUSTOM_VIDEO_STYLE = 1500;
/** Escolha da pessoa na tela de render e de revisão: estilo pronto, texto livre ou os dois. */
export function composeVideoStyle(choice: { styleId?: unknown; custom?: unknown }): VisualStyle {
  const hasPreset = choice.styleId !== undefined && choice.styleId !== '';
  const preset = hasPreset ? visualStyleFor(choice.styleId, 'video') : undefined;
  if (hasPreset && !preset) throw new Error('Estilo de vídeo desconhecido; escolha um estilo pronto ou descreva o seu.');
  if (choice.custom !== undefined && typeof choice.custom !== 'string') throw new Error('O texto do estilo precisa ser um texto.');
  const custom = (choice.custom ?? '').replace(/\s+/g, ' ').trim();
  if (custom.length > MAX_CUSTOM_VIDEO_STYLE) throw new Error(`Descreva o estilo em até ${MAX_CUSTOM_VIDEO_STYLE} caracteres.`);
  if (!preset && !custom) throw new Error('Escolha um estilo pronto ou descreva o estilo desejado.');
  if (!preset) return { id: 'custom', title: 'Estilo personalizado', direction: custom };
  return custom ? { id: preset.id, title: `${preset.title} com ajustes`, direction: `${preset.direction} Ajustes pedidos: ${custom}` } : preset;
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
  'post-1x1': 'post único quadrado 1:1, 1080 × 1080 px',
  'carousel-1x1': 'carrossel quadrado 1:1, 1080 × 1080 px',
  'post-4x5': 'post único vertical 4:5, 1080 × 1350 px',
  'carousel-4x5': 'carrossel vertical 4:5, 1080 × 1350 px',
  'post-4x3': 'post único horizontal 4:3, 1440 × 1080 px',
  'carousel-4x3': 'carrossel horizontal 4:3, 1440 × 1080 px',
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
  const template = recipe.kind === 'image' && !input.format.startsWith('carousel-') && recipe.singlePrompt ? recipe.singlePrompt : recipe.prompt;
  return `${interpolatePrompt(template, input)}\n\nFormato obrigatório: ${formatDescription(input.format)}. Respeite proporção, dimensões e áreas seguras; não converta para outro formato.`;
}

export function interpolatePrompt(template: string, input: PromptInputs): string {
  const values: Record<string, string> = {
    topic: input.topic.trim() || 'tema a definir',
    audience: input.audience.trim() || 'público geral',
    tone: input.tone.trim() || 'claro e direto',
    callToAction: input.callToAction.trim() || 'salve e compartilhe',
    format: formatDescription(input.format),
    pageCount: typeof input.pageCount === 'number' && Number.isInteger(input.pageCount) && input.pageCount > 0 ? String(input.pageCount) : 'a definir',
    brandImagePolicy: input.useBrandImages === false
      ? 'Não abra, anexe, copie nem use fotos ou imagens de referência da marca, mesmo que existam. Use o briefing textual, paleta e visuais originais. Não represente o cliente, depoimentos, produtos ou resultados sem material e autorização.'
      : 'Use fotos e imagens de referência da marca somente quando existirem, forem pertinentes e autorizadas; sem referência útil, crie visuais originais. Nunca invente retratos, depoimentos, produtos ou resultados.',
  };
  const aliases: Record<string, string> = {
    topic: 'topic', tema: 'topic', assunto: 'topic',
    audience: 'audience', publico: 'audience',
    tone: 'tone', tom: 'tone',
    calltoaction: 'callToAction', call_to_action: 'callToAction', cta: 'callToAction', chamada: 'callToAction',
    format: 'format', formato: 'format',
    pagecount: 'pageCount', paginas: 'pageCount', slides: 'pageCount',
    brandimagepolicy: 'brandImagePolicy',
  };
  return template.replace(/\{\{([^{}]+)\}\}/g, (_, placeholder: string) => {
    const alias = placeholder.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const key = aliases[alias];
    return key ? values[key] : `{{${placeholder}}}`;
  });
}

export function suggestProjectTitle(kind: PromptKind, topic: string, format?: ProjectFormatId): string {
  const subject = topic.trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!subject) return '';
  const prefix = kind !== 'image' ? 'Vídeo' : format === 'story-9x16' ? 'Story' : format?.startsWith('post-') ? 'Post' : 'Carrossel';
  return `${prefix}: ${subject}`;
}

export function composeProjectBrief(input: PromptInputs, additionalNotes = ''): string {
  return [
    `Tema: ${input.topic.trim()}`,
    input.audience.trim() ? `Público: ${input.audience.trim()}` : '',
    input.tone.trim() ? `Tom: ${input.tone.trim()}` : '',
    input.callToAction.trim() ? `Chamada final: ${input.callToAction.trim()}` : '',
    `Formato: ${formatDescription(input.format)} (${input.format})`,
    `Fotos de referência da marca: ${input.useBrandImages === false ? 'não usar' : 'usar apenas quando pertinentes e autorizadas'}`,
    additionalNotes.trim(),
  ].filter(Boolean).join('\n');
}
