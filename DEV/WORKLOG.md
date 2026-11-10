# Worklog — Máquina de Conteúdo

## 2026-11-07 — Validação da chave ElevenLabs por status HTTP
- Spec: `DEV/SPECS/ACTIVE.md`; `DEV/DECISIONS.md` (ADR-023).
- Changed: `src/main/elevenlabs.ts` (`providerError`, `permissionError`, `networkError`, `validateElevenLabsKey`): 401 sem `missing_permissions` recusa e não salva; 401/403 com `missing_permissions` salva com `ElevenLabsStatus.warning`; 429 e rede com mensagens próprias; `src/main/runtime.ts` expõe o aviso em `elevenlabs.status`; `src/renderer/VideoGoVoiceSetup.tsx` mostra a ressalva.
- Reason: a chave não validava nem salvava; 403 de chave restrita não invalida a chave, e testar TTS seria chamada paga.
- Verified: `tests/elevenlabs-key.test.ts` (5 testes com `fetch` stubado); NarracaoVerify confirmou recusa antes de qualquer rede quando não há chave. Chave real não testada (sem autorização).
- Limits: sem chamada à API real da ElevenLabs; comportamento com chave válida ou restrita real não exercitado.
- Next context: validar com chave real quando a usuária autorizar; confirmar se a chave restrita salva com aviso atende (pergunta 2).

## 2026-11-07 — Narração por cena, áudio próprio e Modo Studio
- Spec: `DEV/SPECS/ACTIVE.md`; `DEV/DECISIONS.md` (ADR-024).
- Changed: `src/shared/narration.ts` (extensões, MIME de gravação, `narrationGate`); `src/main/narration-audio-attach.ts` (ffprobe e conversão para `narration.m4a`); `src/main/projects.ts` (anexo/remoção por cena, gate de render, migração legada, ref órfã tolerada na leitura); `src/renderer/NarrationTeleprompter.tsx` (teleprompter com `MediaRecorder`); `src/main/permissions.ts` e `src/main/electron.ts` (permissão `media` só para áudio puro do app; câmera negada); `package.json` (`NSMicrophoneUsageDescription`); `src/renderer/Studio.tsx` ("Enviar áudio", "Remover áudio", "Modo Studio").
- Reason: pedidos de gerar sem voz e adicionar depois, upload de áudio próprio e teleprompter com gravação; `import-narration` do VideoGo exige faster-whisper, ausente na máquina.
- Verified: `tests/narration-gating.test.ts`, `tests/narration-attach.test.ts` e `tests/permissions.test.ts`; NarracaoVerify sem rede e sem pago (upload mp3; gravação webm opus → `narration.m4a` 3,007 s; `confirm` exigido na remoção; texto alterado remove só o áudio da cena; render recusa sem áudio).
- Limits: microfone real, indicador e UI do Modo Studio não verificados em Electron; qualidade do áudio gravado não avaliada; gate não aponta voz sem chave; estado não expõe `stray`; narração por IA local pendente de decisão (pendência 12).
- Next context: decidir pendência 12 (SAPI/Piper/manter ElevenLabs) e validar o Modo Studio em Electron quando houver autorização de reinício.

## 2026-11-08 — Revisão geral: E1-E6, divergências 1-3 e pendências 9-13 (autopilot revisao-geral)
- Spec: `.omx/plans/autopilot-spec-revisao-geral.md`; `DEV/DECISIONS.md` (ADR-025 a ADR-032).
- Changed: aprovações editoriais PostNow fail-closed, com reconciliação e `claims.json` validado (`src/main/projects.ts`, `src/main/content/native.ts`, `src/main/agents.ts`; ADR-030); referência órfã removível e opção "gere" só com chave ElevenLabs (`src/shared/narration.ts`, `src/shared/contracts.ts`, `src/renderer/Studio.tsx`, `src/renderer/NarrationTeleprompter.tsx`; ADR-025); briefing de vídeo lista só pendências reais (`src/main/content/native.ts`; ADR-031); falha de comando mostra código e comando (`src/shared/agent-events.ts`; ADR-027); recorte 1448×1086 sem corte e textos corrigidos (ADR-028); contrato VideoGo v1 como aviso no Studio e recusa no render (`src/shared/storyboard-contract.ts`, novo; ADR-032); 429 da ElevenLabs não grava a chave (`tests/elevenlabs-key.test.ts`); inventário M01–M20 em `DEV/TESTING.md`; pendências 9–13 com default "manter" (ADR-029).
- Reason: correções do plano de revisão e divergências 1–3 de `DEV/VERIFY.md` (2026-11-07). Aprovação pré-marcada e referência órfã invisível eram falhas de integridade e de decisão humana.
- Verified: typecheck e lint exit 0; `npm test` 188/188; smoke `"ok": true`; build ok (renderer 722.07 kB; aviso >500 kB pré-existente); cruzamento com `../VideoGo` (26 casos, 24 concordam); validação single-agent. `check-dev-gates --strict` registrado em `DEV/VERIFY.md`.
- Limits: Architect e Critic indisponíveis (`usage_limit_reached`); sem Electron; chave ElevenLabs real, TTS, ImageGen, `codex exec` e reinício não executados (pausas); E1 e E3 sem reprodução; AC13 ii não implementado; storyboard é aviso, não bloqueio (ADR-032); cinco artes da Patricia não inspecionadas. Sem commit.
- Next context: decidir pendências 9–13 (default "manter" aplicado); validar Modo Studio e chave ElevenLabs real quando houver autorização; validação pós-job do storyboard (AC13 iii) se o comportamento for aprovado.

## 2026-11-09 — Biblioteca editorial premium
- Spec: `DEV/SPECS/ACTIVE.md`; jornada de criação e biblioteca existente.
- Changed: `Projects.tsx` e `projects-cards.css` separam criação e biblioteca, apresentam quantidade filtrada e deixam explícita a ausência de capa.
- Reason: mesa editorial de produção, sem imagens fictícias ou efeitos de marketing no aplicativo. Referências consultadas: Godly/Recent (apresentação visual de projetos) e Awwwards/OrbitAI (hierarquia de espaço de trabalho), sem copiar layouts.
- Verified: build, typecheck e lint; prévia isolada em 320, 390, 768, 1024 e 1440 px; capa disponível, busca sem resultados, abertura de criação e Escape.
- Limits: sem geração paga ou teste de Electron nativo nesta rodada.
- Next context: reiniciar o aplicativo para carregar o build atualizado.

## 2026-11-09 — Vídeo: Opus 5.5 fixo com acesso real ao VideoGo
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/main/agents.ts` (modelo `claude-opus-5-5` fixo via `VIDEO_AGENT_MODEL` em `src/shared/contracts.ts`, `--effort xhigh`, `--allowedTools` com leitura do motor e só `project validate|sound|render|sheet` + limpeza da prévia, perfil da marca no ambiente, contrato do storyboard reescrito: `title`, `assetPath` para foto, `compositionId` para 3D, narração paga intocada); `src/main/projects.ts` exporta `writeBrandProfile`; `src/shared/brand-profile.ts` grava 4 `accents` só com cores da marca; `src/shared/storyboard-contract.ts` exige `assetPath` em `kind: image`; `src/renderer/model-catalog.ts` e `Studio.tsx` mostram o ID fixo. VideoGo (repo irmão): `storyboard.ts` sem título derivado do id, `kind: image` sem asset vira erro, deixas de som sem soma dupla do início e com `anchor`.
- Reason: o vídeo saía genérico ("SCENE 1 GANCHO", sem foto, glow verde-limão). O modelo já era `claude-opus-5-5` (transcript), mas o `-p` bloqueava leitura do VideoGo e todo comando: o agente escrevia o storyboard às cegas e nunca via a prévia. A GPU já estava em uso (`h264_nvenc` nos MP4).
- Verified: typecheck, lint, `npm test` 222/222, build; VideoGo typecheck, build e `test:core` 60/60. Regeração real do projeto `video-meus-filhos-vao-ficar-com-o-pai` pelo `handleAgents`: sessão `claude-opus-5-5`, 116 turnos, leu skill e contrato, validou, gerou som, 4 prévias com folha de contato. Aprovação e render pelo `handleProjects`: gate da narração passou, 41 s, 1080×1920, `h264_nvenc`, 29,9 s de render; quadros com títulos, fotos da marca, balança e documentos 3D.
- Limits: áudio do render final não ouvido; Claude Code usa Haiku internamente em subtarefas (ex.: WebFetch, negado); backup do storyboard anterior em `~/MaquinaDeConteudo/backup-video-meus-filhos-20261109-201619`.
- Next context: reiniciar o app para carregar o build; o enfeite de "interface" do padrão clássico no gancho ainda aparece (VideoGo `hyperframes-renderer.ts`, `uiMockupHtml`).

## 2026-11-09 — Vídeo autoral no VideoGo: Opus 5.5 medium escreve a animação
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: Studio — `VIDEO_AGENT_EFFORT = 'medium'`; entrega com capa só no Codex ImageGen e copy no Claude `claude-opus-5-5` (`agents.ts`, `Studio.tsx`, `tests/video-delivery.test.ts`); acesso do agente a `project composition` e `hyperframes lint|snapshot|docs`, composição em `.videogo/composition` (fora da galeria); `composition` aceito no contrato (`storyboard-contract.ts`) e no sanitizador (`content/native.ts`, antes apagava a chave). VideoGo — `storyboard.composition.path`; `project composition` (timeline real da voz, palavras com tempo via faster-whisper local, mídia do projeto, GSAP, Three.js, kit 3D, `VIDEOGO.md`, `index.html` base preservado); `project render` usa a composição autoral no lugar do template, mistura voz/efeitos/trilha e recusa duração diferente da timeline.
- Reason: o render de template (`classic`) dava o mesmo visual genérico mesmo com storyboard bom; o modelo e a GPU não eram a causa.
- Verified: Studio typecheck, lint, `npm test` 222/222, build, app reiniciado no build novo; VideoGo typecheck, build, `test:core` 62/62, `test:flicker` 20/20. Fluxo real pelos handlers do Studio: sessão Opus 5.5 medium (71 turnos, US$ 3,08) escreveu a composição; segunda sessão sincronizou às palavras e parou no limite de 5 h do Claude depois do lint e do snapshot; aprovação e render: 41 s, 1080×1920, `h264_nvenc`, −14,1 LUFS, 29,8 s.
- Limits: áudio não ouvido; a segunda sessão não chegou à última prévia completa (o render final foi feito com o estado após lint e snapshot); sessões de vídeo consomem a cota de 5 h da conta Claude.
- Next context: o agente ainda tenta `cd`/`sed`/`python3` fora da allowlist e recebe negação; o fluxo funciona sem eles.

## 2026-11-09 — Entrega: capa preservada quando o Claude falha; login do Claude conferido
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `agents.ts` publica `delivery/cover-<formato>.png` antes da copy; falha do Claude vira erro que cita a capa salva; nova ação `agents.generateVideoCopy` (só a copy, Claude Opus 5.5, sem refazer a capa) e botão "Gerar só a copy (Claude)" em `Studio.tsx`; `setup/tools.ts` mostra o plano do Claude junto do e-mail.
- Reason: o job de entrega falhou com "You've hit your 5-hour limit" e descartava a capa paga do Codex.
- Verified: typecheck, lint, `npm test` 223/223, build, app reiniciado; `setup.status` real: `robertobezerracontador@gmail.com · plano pro`, CLI gerenciado e o do terminal com o mesmo `~/.claude` (`.credentials.json` de 13:45, mesmo horário do único job "Login claude"). Capa da execução que falhou publicada em `delivery/cover-reels.png` (941×1672 → 1080×1920).
- Limits: copy real do Claude não executada (conta no limite até 00:20); logout real não executado para não desconectar a conta.
- Next context: validar copy do Claude apos expiracao do limite de 5h.

## 2026-11-09 — Capa com título, pessoa fiel e logo oficial; contas visíveis
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `agents.ts` — `COVER_LAYOUT` por formato (medidas, área da logo, zonas de interface do Reels/YouTube e recorte 4:5 do grid); prompt do Codex exige o título exato, fidelidade à pessoa das fotos reais, foto contínua sem recorte, área da logo lisa e conferência com até 3 tentativas; o Studio aplica a logo oficial por cima (ffmpeg `overlay`); ação `coverOnly` e botão "Gerar só a capa (Codex)". `setup/tools.ts` — e-mail e plano do Codex via `codex app-server` → `account/read` (sem ler arquivo de credencial), e-mail do GitHub via `gh api` (login pede `user:email`), plano do Claude.
- Reason: a capa saía sem título nem pessoa, depois com rosto genérico e faixa vazia; a conta logada de cada CLI não aparecia.
- Verified: typecheck, lint, `npm test` 223/223, build, app reiniciado; `setup.status` real: GitHub `@FernandoBolzan` (e-mail privado até novo login), Codex `metabolzan@gmail.com · plano plus`, Claude `robertobezerracontador@gmail.com · plano pro`. Capas reais geradas pelo fluxo `agents.generateVideoDelivery` com `coverOnly`.
- Limits: e-mail do GitHub só depois de reconectar (escopo novo); copy do Claude pendente do limite de 5 h.
- Next context: testar e-mail do GitHub ao reconectar.

## 2026-11-09 — Motores & Setup: submenu ElevenLabs, overview executivo e redesign de layout
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/renderer/App.tsx` (navegação com `setupSubmenu: 'engines' | 'elevenlabs'`, submenu aninhado na sidebar com pills de status, breadcrumb com navegação hierárquica e deep link de voz); `src/renderer/Setup.tsx` (segmented tabs para alternar entre Motores & CLIs e ElevenLabs & Voz, banner executivo de status com métricas operacionais, desacoplamento completo do bloco de voz, link direto no onboarding); `src/renderer/VideoGoVoiceSetup.tsx` (dashboard dedicado de voz com 4 pilares de governança e segurança, toggle de visualização da API key, catálogo de vozes pesquisável com filtro por categoria, player de áudio preview sob demanda interativo, guia de clonagem instantânea estruturado em passos, checkbox de consentimento legal e diagnóstico local de áudio FFprobe); `src/renderer/shell-refined.css` (estilos para submenu na sidebar, tabs in-page, cards de estatísticas, ribbon de segurança, catálogo de vozes e responsividade sem overflow em 390/768/1280/1440 px).
- Reason: atender ao pedido do maestro para separar ElevenLabs como um submenu de Motores & Setup e aprimorar todo o layout visual do ecossistema de configuração conforme as skills do Orquestrador Maestro (`skill-frontend-excellence`, `skill-design-engineering-craft`, `skill-impeccable`).
- Verified: `npm run typecheck`, `npm run lint` (exit 0); `npm test` (223/223); `npm run smoke` (`ok: true`); `npm run build` (exit 0); verificação interativa visual em Chromium via Browser API em 4 viewports (390, 768, 1280, 1440 px com 0 overflow), alternância de abas e submenus na sidebar e in-page, e navegação direta do Studio para o painel ElevenLabs.
- Limits: sem envio de áudio pago real para a ElevenLabs (validação da API key e listagem de vozes exercitados no sandbox do browser); Electron desktop nativo não foi reiniciado nesta sessão.
- Next context: reiniciar a aplicação desktop para carregar os novos componentes compilados no Electron nativo.

## 2026-11-09 — Fluxo simplificado: Avançar aprova a etapa; isolamento das contas Claude/Codex
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `Studio.tsx` — removidos "Aprovar conteúdo para imagem" (com checkbox), "Aprovar texto" e "Aprovar áudio" por cena; o "Avançar" de textos, roteiro e voz aprova a etapa e só então abre a próxima; "Gerar áudio" aprova o texto/voz junto (já confirma o envio ao ElevenLabs) e o Avançar aprova os áudios gerados. `VideoSceneEditor.tsx` — sem botão "Revisar e aprovar roteiro"; reporta edição não salva via `onDirtyChange`. `setup/tools.ts` — `CLAUDE_CONFIG_DIR` e `CODEX_HOME` isolados em `<dataDir>` para os runs do Studio, sem ler `~/.claude` ou `~/.codex`. Capa: referências das fotos de marca no prompt e limite de copy do Claude com hora de liberação.
- Reason: o usuário precisava clicar em vários "Aceitar" antes do "Avançar", que já aceitava tudo; a conta Claude do terminal estourou o limite de 5 h durante a entrega; contas do terminal/desktop interferiam no Studio.
- Verified: typecheck, lint limpo, `npm test` 223/223; app reiniciado (Electron PID 1081881, janela pronta, sem erro de renderer no log). Não cliquei o fluxo na janela nativa.
- Limits: sem teste manual do fluxo de clique no Electron; a copy do Reels segue pendente de login do Claude dentro do Studio.
- Next context: testar Avançar nos três passos com projeto real de vídeo e de imagem; decidir se semeia `CLAUDE.md`/`AGENTS.md` nas pastas isoladas.

## 2026-11-10 — Atualização automática do app por release por tag (v0.2.0)
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/main/app-updater.ts` (novo) — baixa a versão em segundo plano (`autoDownload`), instala ao fechar (`autoInstallOnAppQuit`), consulta 15 s após abrir e depois a cada 6 h; status publicado pelo evento `update` (`src/shared/contracts.ts`). `src/main/electron.ts` — `app.updateStatus`/`app.updateCheck`/`app.updateInstall`; reinício recusado com tarefas em execução. `src/renderer/Setup.tsx` — Preferências mostra o estado e **Reiniciar e atualizar** quando pronto. `tests/app-updater.test.ts` (7 testes com updater falso). Docs: `DEV/RUNBOOKS/RELEASES.md`, `README.md`.
- Reason: o usuário pediu que instalações já feitas recebam novas versões sem baixar manualmente; a publicação é feita pela tag `v0.2.0` (workflow `release.yml` gera `.exe`, `.dmg`/`.zip`, AppImage e `.deb`).
- Verified: `npm run typecheck`, `npm run lint`, `npm test` 230/230, `npm run build`, `npm run smoke` (`ok`), `npm run dist:linux` (AppImage `maquina-de-conteudo-0.2.0-x86_64.AppImage` e `latest-linux.yml` com o mesmo nome).
- Limits: a descarga e instalação ponta a ponta não foram exercitadas (exige release superior publicada); Windows e macOS não foram compilados aqui; macOS sem assinatura não atualiza; `.deb` segue manual.
- Next context: após a release, testar AppImage instalado com v0.2.0 contra v0.2.1 de teste; decidir assinatura macOS/Windows.

## 2026-11-10 — Release 0.2.1: abas do submenu corrigidas
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/renderer/shell-refined.css` — `.setup-subnav` com `flex-wrap: wrap` e sem `overflow-x: auto`; as abas "Motores & CLIs" e "ElevenLabs & Voz" quebram para outra linha em vez de cortar. `package.json` e `package-lock.json` em 0.2.1. README e `DEV/RUNBOOKS/RELEASES.md` atualizados ao estado publicado.
- Reason: a captura do usuário mostrou as abas cortadas na v0.2.0. O runbook proíbe mover tag publicada, então a correção sai como 0.2.1.
- Verified: `npm run typecheck`, `npm run lint`, `npm test` 230/230, `npm run smoke` (`ok: true`); preview visual em 4178 mostrou as duas abas inteiras, sem barra de rolagem.
- Limits: Windows e macOS nativos não foram testados; macOS sem assinatura não atualiza; sem arquivo `LICENSE` (licença não definida).
- Next context: após publicar 0.2.1, testar a atualização de uma instalação 0.2.0 para 0.2.1; decidir licença e assinatura de macOS/Windows.
