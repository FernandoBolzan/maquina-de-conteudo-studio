import type { VideoSound } from './contracts.js';

/** Direção de produção de vídeo: roteiro, cenas 3D, HTML, motion e prévia no Claude Opus fixo. */
export function motionDirectorPrompt(input: { fromPost: boolean }): string {
  return [
    'DIREÇÃO DE VÍDEO: produza este vídeo vertical com Claude Opus 5.5. Você é responsável pelo roteiro visual, cenas, código HTML, composição 2D/3D, motion e conferência da prévia. Não delegue frames, cenas, imagens ou código a Codex, ImageGen ou outro modelo.',
    'AUTORIA DOS FRAMES: crie as imagens diretamente como elementos visuais da composição em .videogo/composition/index.html usando Three.js do VideoGo, SVG, CSS, GSAP, diagramas e assets existentes no projeto. O VideoGo rasteriza os frames do HTML na prévia e no MP4; não gere PNGs de fundo por outro modelo. Se o pedido especificar 3D, modele as cenas em Three.js e marque as cenas correspondentes como visual.kind "3d", com compositionId aceito pelo contrato do VideoGo.',
    input.fromPost
      ? 'ORIGEM: este vídeo nasceu de um post. Leia as artes e a copy de origem como referências de conteúdo, paleta e marca, nunca como frames finais: elas têm outra proporção e não devem ser usadas como fundo. Se o storyboard ainda apontar para assets/visuals/scenes/NN.png do pipeline antigo, remova esses assetPath e refaça as cenas em visual.kind "3d", "diagram" ou "mixed", com composição 3D feita por você no HTML. Recrie as ideias de cada cena como visuais 3D, SVG, diagramas e tipografia animada, todos escritos por você na composição.'
      : 'ORIGEM: parta do briefing, roteiro e fontes do projeto. Preserve narration, audio.spokenText e audio.narration exatamente como estão.',
    'COMPOSIÇÃO: escreva a animação autoral completa em .videogo/composition/index.html, seguindo timeline.json e o contrato VIDEOGO.md. O padrão não é imagem parada com zoom lento. Combine Three.js 3D quando a ideia pedir volume, GSAP, SVG, tipografia cinética e diagramas. Use só assets existentes do projeto e do kit local do VideoGo; não invente arquivos.',
    [
      'MOTION, todos obrigatórios:',
      '1. Gancho: nos 2 primeiros segundos já há movimento forte e a pergunta ou a promessa na tela.',
      '2. Tipografia cinética: título e palavra-chave entram no instante em que são faladas (timeline.json traz início e duração reais de cada cena); a palavra em destaque usa a cor de acento da marca.',
      '3. Câmera viva: movimentos 3D com profundidade, parallax e mudança de escala entre cenas, sem repetir o mesmo movimento.',
      '4. Elementos de apoio que explicam a fala: números que contam, linhas e setas que se desenham, cartões de evidência, checklist que marca, linha do tempo e objetos 3D.',
      '5. Ritmo: um evento visual novo a cada 1 a 2 segundos, pausas só quando a informação pedir, transições com intenção entre cenas.',
      '6. Fechamento: chamada final animada com a CTA do briefing e a logo oficial (assets/brand/logo*) dentro da área segura.',
      '7. Zonas seguras do Reels: nada importante nos 14% de cima, nos 22% de baixo nem na coluna direita de botões; texto grande, contraste alto, no máximo duas famílias tipográficas, paleta e tom da marca.',
      '8. Sem áudio na composição: voz, efeitos e trilha vêm do VideoGo (comando sound).',
    ].join('\n'),
    'CICLO COMPLETO: valide o storyboard, aplique a preferência de som do projeto (efeitos e trilha) com o comando sound do VideoGo, crie a composição, rode lint, snapshot, renderize a prévia e gere a folha de contato. Abra os quadros reais, confira ritmo, enquadramento, legibilidade, animações e uso de 3D. Corrija os problemas encontrados e repita até a prévia estar pronta para revisão humana.',
    'Mantenha storyboard.json em status "draft". Não renderize o arquivo final, não aprove o roteiro e não altere os textos da narração. A pessoa revisa e aprova no Studio.',
  ].join('\n\n');
}

/**
 * Pedido de revisão feito depois de assistir ao vídeo renderizado: pode mexer no roteiro e na composição animada.
 * Com `produce`, o vídeo atual saiu sem composição autoral do Opus: a revisão vira a produção completa mais o pedido.
 */
export function videoRevisionPrompt(request: string, files: { contactSheet?: string; produce?: { fromPost: boolean } }): string {
  if (files.produce) {
    return [
      'REVISÃO COM PRODUÇÃO COMPLETA. O vídeo atual foi renderizado sem a composição autoral do Claude Opus 5.5: só com o visual genérico de template do VideoGo. Produza agora o vídeo inteiro pela direção abaixo e atenda também ao pedido da pessoa no fim.',
      motionDirectorPrompt(files.produce),
      files.contactSheet ? `O QUE FOI ENTREGUE: abra com Read a folha de contato do render atual em ${files.contactSheet} para ver o que precisa melhorar.` : '',
      'LIMITES: não gere narração, não renderize em renders/, não marque o roteiro como ready (status "draft": a pessoa aprova no Studio) e não aprove nada.',
      '',
      'PEDIDO DA PESSOA:',
      request.trim(),
    ].filter(Boolean).join('\n\n');
  }
  return [
    'REVISÃO DO VÍDEO. A pessoa assistiu ao render e pediu a mudança abaixo. Atenda com o menor conjunto de alterações que resolve o pedido e mantenha a marca, o formato e as fontes verificadas.',
    'COMO ALTERAR: textos e ordem das cenas em storyboard.json (sem tocar em narration, audio.spokenText e audio.narration de cenas que já têm voz gerada: a voz é paga e a aprovação está presa ao texto); animação, ritmo, cores, tipografia, transições e elementos visuais em .videogo/composition/index.html. Se essa pasta ainda não existir, crie-a com o comando composition antes de escrever.',
    files.contactSheet ? `O QUE FOI ENTREGUE: abra com Read a folha de contato do render atual em ${files.contactSheet} para ver os quadros reais antes de decidir.` : '',
    'CONFERÊNCIA: depois de editar, rode validate, lint, snapshot e a prévia (render e sheet) e abra os quadros. Corrija o que ficar vazio, cortado, ilegível ou fora do tempo.',
    'LIMITES: não gere narração, não renderize em renders/, não marque o roteiro como ready (status "draft": a pessoa aprova no Studio) e não aprove nada.',
    '',
    'PEDIDO DA PESSOA:',
    request.trim(),
  ].filter(Boolean).join('\n\n');
}

/** Argumentos do comando `project sound` conforme a preferência; undefined quando o vídeo não leva efeitos nem trilha. */
export function videoSoundArgs(sound: VideoSound): string | undefined {
  if (!sound.effects && !sound.music) return undefined;
  const mood = sound.mood === 'auto' ? 'calm' : sound.mood;
  return `--density ${sound.effects ? 'normal' : 'minimal'} --mood ${mood}${sound.music ? '' : ' --no-music'} --apply`;
}

/** Regra de som escolhida no Studio: vai a toda sessão do agente de vídeo. */
export function videoSoundRule(sound: VideoSound): string {
  const mood = sound.mood === 'auto'
    ? 'Escolha o --mood pelo tipo do vídeo: calm para temas sérios, jurídicos, de saúde ou acolhimento; tech para tecnologia, dados e ferramentas; energetic para dicas rápidas, listas, motivação e entretenimento. Na dúvida, calm.'
    : `Use --mood ${sound.mood}, escolhido pela pessoa.`;
  if (!sound.effects && !sound.music) {
    return 'SOM ESCOLHIDO PELA PESSOA: sem efeitos sonoros e sem trilha de fundo. Não rode o comando sound; deixe audio.sfxCues [] em todas as cenas e music sem assetPath. O vídeo leva só a narração.';
  }
  return [
    `SOM ESCOLHIDO PELA PESSOA: ${sound.effects ? 'com efeitos sonoros' : 'sem efeitos sonoros'} e ${sound.music ? 'com trilha de fundo' : 'sem trilha de fundo'}, ligados ao tema do vídeo.`,
    `Rode o comando sound com ${videoSoundArgs(sound)}${sound.mood === 'auto' ? ' (troque o --mood conforme a regra abaixo)' : ''} e valide de novo.`,
    mood,
    sound.effects
      ? 'EFEITOS: confira as deixas geradas e ajuste at/anchor para cair na entrada de cada palavra-chave, transição e elemento animado da composição; remova efeito que compete com a voz. Volume discreto, sempre abaixo da narração.'
      : 'EFEITOS: depois do comando sound, deixe audio.sfxCues [] em todas as cenas: a pessoa não quer efeitos.',
    sound.music
      ? 'TRILHA: music com volume 0.15 e duckUnderVoice true, ritmo coerente com o tema; nunca abafa a voz.'
      : 'TRILHA: sem trilha; o comando já roda com --no-music, então mantenha music sem assetPath.',
  ].join(' ');
}

/** Regra permanente do estilo escolhido para o vídeo: vai a toda sessão do agente de vídeo, para que nenhuma outra mudança o desfaça. */
export function videoStyleRule(style: { title: string; direction: string }): string {
  return `ESTILO VISUAL ESCOLHIDO PARA O VÍDEO (“${style.title.replace(/\s+/g, ' ').trim()}”): ${style.direction} Mantenha este estilo em qualquer alteração de cena, composição ou animação, sem mudar narração, fatos nem fontes.`;
}

/** Troca do estilo visual de um vídeo que já foi renderizado (ou está pronto para renderizar): refaz só a linguagem visual e mantém o conteúdo. */
export function videoStylePrompt(style: { title: string; direction: string }, files: { contactSheet?: string }): string {
  return [
    'MUDANÇA DE ESTILO DO VÍDEO. A pessoa escolheu um novo estilo visual para este vídeo. Refaça a linguagem visual inteira nesse estilo e mantenha o conteúdo: mesmas cenas, mesma ordem, mesmos fatos, fontes, formato e marca.',
    `NOVO ESTILO (“${style.title.replace(/\s+/g, ' ').trim()}”): ${style.direction}`,
    'O QUE MUDA: kind e direção visual de cada cena em storyboard.json (visual.kind, visual.direction, layout, camera, compositionId), e em .videogo/composition/index.html a composição animada: tipografia, cores dentro da paleta da marca, ritmo, transições, elementos de apoio e câmera. Se essa pasta ainda não existir, crie-a com o comando composition antes de escrever. Use só arquivos que existem no projeto (assets/brand, kit 3D do VideoGo, diagramas e tipografia); não invente arquivo.',
    'O QUE NÃO MUDA: narration, audio.spokenText e audio.narration (a voz é paga e a aprovação está presa ao texto), durações, fatos, fontes, CTA e logo oficial. Textos em tela só mudam se o novo estilo exigir encurtar para caber, sem alterar o sentido.',
    files.contactSheet ? `O QUE FOI ENTREGUE ATÉ AGORA: abra com Read a folha de contato do render atual em ${files.contactSheet} para ver o estilo anterior antes de decidir.` : '',
    'CONFERÊNCIA: depois de editar, rode validate, lint, snapshot e a prévia (render e sheet) e abra os quadros. Confirme que o estilo novo está claro em todas as cenas e corrija o que ficar vazio, cortado, ilegível ou fora do tempo.',
    'LIMITES: não gere narração, não renderize em renders/, não marque o roteiro como ready (status "draft": a pessoa aprova no Studio) e não aprove nada.',
  ].filter(Boolean).join('\n\n');
}
