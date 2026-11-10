# Worklog Archive

Older worklog entries moved out of `DEV/WORKLOG.md` by `compact-worklog`.

Read `DEV/HANDOFF.md` and the retained `DEV/WORKLOG.md` entries before opening this archive.

## 2026-11-05 — Fluxo Studio ElevenLabs v4 e narração aprovada
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/main/elevenlabs.ts`, `src/main/runtime.ts`, `src/main/projects.ts`, `src/renderer/Setup.tsx`, `src/renderer/Studio.tsx`, contratos, testes e instruções de uso.
- Reason: Configurar key cifrada, escolher/clonar voz e gerar áudio por cena somente após aprovação hash-bound da narração; cada clipe também requer aprovação antes do render final.
- Verified: typecheck, lint, 7/7 testes, smoke, build; teste offline de segredo e bloqueio pré-aprovação; Chromium preview em 390 px sem overflow e sem erros. VideoGo: typecheck, core 49/49, flicker 20/20, E2E de áudio externo e build.
- Limits: nenhuma API paga ou clonagem real; no preview sem cofre, key e voz permanecem indisponíveis. Correção do mantenedor em `listVoices`/`cloneVoice` do VideoGo não foi tocada.

## 2026-11-05 — QA final Linux e release v0.1.1

- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: README completo com downloads diretos v0.1.1 e destaque de que a integração ElevenLabs posterior à tag está só na branch `main`; guias de instalação, uso, motores, segurança, updates, desenvolvimento e status por plataforma.
- Published: release pública `v0.1.1`; Actions run `42045235690` concluiu build e publicação Linux, Windows e macOS. Feeds públicos e nomes dos assets foram conferidos.
- Reason: alinhar a página inicial aos assets oficiais sem atribuir aos downloads features que só existem no código atual da branch.
- Verified: typecheck, lint, 7/7 testes, smoke Linux default/overrides, build, `dist:linux` e gate DEV strict; AppImage testado foi build local de `main`, não o asset oficial v0.1.1. Downloads/manifests e diferença de árvore tag/main verificados; comandos de desenvolvimento conferidos com `MDC_DEV_URL`.
- Limits: release oficial v0.1.1 não inclui a integração ElevenLabs de `main`, embora a branch ainda declare 0.1.1. `.deb` não instalado com apt; Windows/macOS nativos, assinatura/notarização, Mac Intel, chamada paga e update entre versões não validados.
- Next context: README diferencia a tag/release v0.1.1 do código `main`: integração ElevenLabs está só em `main`, ainda rotulada 0.1.1. Próxima lacuna: hosts Windows/macOS nativos e alinhamento SemVer antes de qualquer nova distribuição autorizada.

## 2026-11-05 — Diagnóstico e testes locais dos motores
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: dependências tipadas/diagnóstico e receitas FFprobe, testes consentidos em diretório temporário, aviso/data de atualização, UI responsiva e README; fixtures ajustadas ao contrato de armazenamento seguro já presente no worktree.
- Reason: Explicar o que cada motor precisa, permitir verificar o render sem tocar projetos do usuário e tornar o estado de atualização visível sem interromper a criação.
- Verified: typecheck, test (6/6), smoke e build; lint focado nos arquivos deste recurso. Preview Chromium validado em 390/768/1280/1440 sem overflow, botões sem nome ou erros novos. VideoGo produziu MP4 local com `--voice demo`; Maestro montou contexto sem chamar IA; aviso de update disponível foi exercitado com resposta IPC simulada.
- Limits: `npm run lint` ainda falha em três símbolos não usados de `src/main/projects.ts` (`NarrationState`, `listElevenLabsVoices`, `narrationState`), código de narração em evolução fora deste escopo. PostNow foi diagnosticado sem Pillow no ambiente selecionado, portanto o render smoke não foi executado; nenhum pacote/dep foi instalado. Update remoto não disponível no preview.
- Next context: Instalar/vincular PostNow com Pillow para exercitar render; resolver lint da integração de narração antes de considerar a qualidade global concluída.

## 2026-11-05 — Onboarding por objetivo e biblioteca de prompts
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/renderer/Setup.tsx` apresenta configuração orientada a carrossel/post ou vídeo, com o agente selecionado e o motor correspondente; ElevenLabs aparece como opção de voz, não requisito geral. `src/renderer/Studio.tsx` recolhe controles avançados e abre `PromptLibrary.tsx`; modelos de curiosidade, favoritos e prompts pessoais ficam em `prompt-library.ts` no perfil local, com teste em `tests/prompt-library.test.ts`.
- Reason: reduzir decisões de primeira utilização e revisar o prompt exato antes de chamar o agente, sem substituir PostNow/VideoGo nem ultrapassar a aprovação de narração/áudio.
- Verified: `npm run typecheck`, `npm run lint`, `npm test` (13/13), `npm run smoke` e `npm run build`; Chromium confirmou seleção de formato, requisito de voz opcional, modelo → composer, salvar/favoritar prompt pessoal e 0 violações axe, sem erros do renderer. Viewports 390/768/1280/1440 tiveram `body.scrollWidth` igual à largura; screenshot QA do diálogo mostrou biblioteca em uma/duas colunas conforme breakpoint.
- Limits: o preview não instalou motores, não iniciou agente nem usou TTS/API paga; secure storage fica indisponível no browser preview. Build mantém aviso do bundle renderer >500 kB; request externo a Google Fonts falhou no preview, com fontes locais/fallback exibidas.
- Next context: inspecionar o fluxo em Electron empacotado e hosts Windows/macOS continua pendente; favoritos/prompt pessoal armazenam-se no perfil local do renderer, não sincronizam para outro computador.

## 2026-11-05 — Documentação final, smoke configurável e estado real de release
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `README.md`, `scripts/smoke.ts`, `src/main/setup.ts`, `src/main/setup/engines.ts`, documentação de testes, verificação, handoff e release.
- Reason: Documentar o uso/build Linux sem prometer compatibilidade não testada; tornar os paths do smoke configuráveis e registrar a evidência real dos builds nativos no GitHub Actions.
- Verified: typecheck, lint, `npm test` (6/6), smoke com defaults Linux e com overrides, build, `dist:linux`; AppImage atual abriu e o `.deb` apresenta metadados corretos.
- Release/platform status: Actions run `42040288628` construiu os três alvos para `v0.1.0`, mas nenhum upload foi salvo por nomes com `:`. A correção está na `main`; ainda não há release. O dispatch manual publica e não foi executado; Windows/macOS runtime permanece não testado.
- Next context: Para distribuir o worktree atual, autorização para nova versão/tag/publicação é necessária; depois instalar e exercitar os pacotes em hosts nativos Windows/macOS.

## 2026-11-05 — Primeira publicação GitHub e recuperação do release workflow
- Changed: `.gitignore`, `.github/workflows/release.yml`, `DEV/RUNBOOKS/RELEASES.md`
- Published: commit `80cc1e5` em `main`; tag anotada `v0.1.0` enviada ao GitHub.
- Verified: typecheck, lint, tests (5/5), smoke, build, pack e workflow YAML válidos; os três builds nativos do Actions passaram, mas upload-artifact falhou porque `release-dist:linux/mac/windows` continha `:`.
- Next context: nomes corrigidos na `main`; a execução manual compila a tag e publica. Não há assets/release; não executar sem autorização. Para o worktree atual será necessária versão/tag superior.

## 2026-11-05 — Auditoria final do pacote Linux e alvos nativos
- Spec: DEV/SPECS/ACTIVE.md
- Changed: `README.md` e documentação de instalação, verificação, testes reproduzíveis e limites por plataforma em `DEV/**`; nenhum código de runtime alterado nesta tarefa.
- Reason: Revalidar o worktree atual e separar comportamento comprovado no Linux de builds que exigem hosts Windows/macOS.
- Verified: typecheck, lint, 5/5 testes, smoke, build AppImage/deb e gates strict; AppImage e fluxos onboarding/projeto/marca/Setup passaram; processo `npm start` foi restaurado após recuperação de Xwayland.
- Limits: `dist:windows` e `dist:mac` tentados no Linux falharam no rebuild de `node-pty` via node-gyp. Não há hosts nativos/SSH nem VM Windows. O smoke também depende de paths Linux fixos; CLIs reais/login, release e atualização remota não foram exercitados.

## 2026-11-05 — Onboarding e Gestão Segura dos CLIs
- Spec: DEV/SPECS/ACTIVE.md
- Changed: `src/shared/contracts.ts`, runtime onboarding/migration, setup backend, gerenciamento de ferramentas, Setup UI, testes de runtime/CLI e notas `DEV/**`.
- Reason: Guiar usuários na primeira execução e tornar Codex/Claude instaláveis/atualizáveis com versão estável, consentimento, diretório privado, validação antes de ativar e rollback sem mexer nas cópias globais.
- Verified: typecheck, lint, `npm test` (5/5), smoke, build, QA Chromium em 390/768/1280 px e `check-dev-gates --strict` passaram; CLI install/update/rollback e preservação da versão ativa quando a staged falha foram exercitados com ferramentas simuladas.
- Limits: Chunk do renderer >500 kB e aviso do gate sobre hotspots históricos em `package.json`/`src/main/electron.ts`. Nenhum CLI real foi instalado/atualizado nem login aberto.

## 2026-11-05 — Fluxos de Usuário e Pacotes Linux
- Spec: DEV/SPECS/ACTIVE.md
- Changed: package.json, src/main/content/carousel.ts, src/main/electron.ts, src/main/update-policy.ts, src/main/setup/tools.ts, src/renderer/Setup.tsx, tests/update-policy.test.ts, .github/workflows/release.yml, DEV/**
- Reason: Tornar explícita a dependência Pillow do carrossel, preparar releases Linux/macOS, documentar SemVer/auto-update e impedir oferta de update in-app em pacotes .deb.
- Verified: typecheck, lint, test (2/2), smoke, build via `npm run dist:linux`; AppImage FUSE abriu sem flags de bypass e onboarding/criação de projeto passaram pela UI em workspace temporário. Também passaram render de cinco slides, aprovação, derivação imagem↔vídeo, render VideoGo, extração FFmpeg e guarda de update Debian.
- Limites: Build NSIS cruzado falhou no `node-gyp` ao reconstruir `node-pty` para Windows; validação nativa Windows/macOS, assinatura/notarização, release/update remoto e geração paga não foram executados.
- Artifacts: `release/Máquina de Conteúdo (Studio)-0.1.0.AppImage`; `release/maquina-de-conteudo_0.1.0_amd64.deb`.

## 2026-11-05 — Releases GitHub e Autoatualização
- Spec: DEV/SPECS/ACTIVE.md
- Changed: package.json, src/main/electron.ts, .github/workflows/release.yml, DEV/RUNBOOKS/RELEASES.md, DEV/**
- Reason: Fixar o repositório oficial, documentar SemVer/tags/releases e automatizar builds nativos/publicação; deixar distribuição local sem publicação implícita.
- Verified: typecheck, lint, test (1/1), smoke, build e `npm run pack` passaram. Nenhuma tag/release foi publicada; workflow remoto, auto-update vivo e hosts Windows/macOS seguem sem validação nesta sessão.
- Next context: Consultar `DEV/RUNBOOKS/RELEASES.md`; quando autorizado, testar tag em GitHub e validar instaladores/updates por host nativo.

## 2026-11-05 — Marca Studio e Iconografia
- Spec: DEV/SPECS/ACTIVE.md
- Changed: package.json, index.html, src/main/electron.ts, src/renderer/App.tsx, src/renderer/styles.css, DEV/**
- Reason: Padronizar o nome visível como Máquina de Conteúdo (Studio) e trocar a chama emoji por ícone Lucide alinhado ao sistema visual local.
- Verified: typecheck, lint, test (1/1), smoke e build aprovados; QA manual Chromium em 390/768/1280/1440, 0 overflow, 0 botões sem nome e 0 erros de console. Harness automático indisponível sem Playwright.
- Next context: Usar `npm start` ou `npm run preview`; geração de imagem “Image 2.5” não está integrada.

## 2026-11-05 — Preferência da Marca Flame
- Changed: src/renderer/App.tsx, src/renderer/styles.css, DEV/SPECS/ACTIVE.md, DEV/HANDOFF.md, DEV/VERIFY.md
- Reason: Restaurar a chama emoji 🔥 solicitada pelo usuário, mantendo Lucide nos ícones funcionais.
- Verified: `npm run typecheck`, `npm run lint` e `npm run build` passaram; Chromium mostrou 🔥 na marca, 0 overflow, 0 botões sem nome e 0 erros em 390/768/1280/1440. Vite mantém aviso de chunk acima de 500 kB.

## 2026-11-04 — Implementação Ponta a Ponta do App Desktop Máquina de Conteúdo
- Spec: DEV/SPECS/ACTIVE.md
- Changed: package.json, tsconfig.json, tsconfig.main.json, vite.config.ts, eslint.config.js, index.html, src/shared/contracts.ts, src/main/**, src/renderer/**, scripts/smoke.ts, scripts/preview.ts, tests/runtime.test.ts, DEV/**
- Verified: npm run typecheck && npm run lint && npm test && npm run smoke && npm run build && orquestrador-maestro check-dev-gates --project-path . --strict
- Next context: Executar npm start no ambiente gráfico ou empacotar releases com dist:linux / dist:windows

## 2026-11-05 — Setup de voz no lugar do motor
- Changed: `src/renderer/VideoGoVoiceSetup.tsx`, `src/renderer/Setup.tsx`, README e `DEV/**`
- Reason: Colocar chave, biblioteca/clonagem e instruções ElevenLabs em Motores & Setup, junto ao VideoGo; Preferências fica com preferências do Studio.
- Verified: design discovery `@./components` resolved (0.90); baseline Chromium captured before editing. Studio typecheck/lint, 7/7 tests, smoke, build and Chromium location check passed; 390 px viewport had no horizontal overflow or page errors. Vite retains the 618.93 kB chunk warning.

## 2026-11-05 — README completo e downloads por plataforma
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `README.md` com descrição do software, recursos, instalação, motores, segurança, estado por plataforma, versões e downloads diretos; notas DEV alinhadas à diferença entre tag/release e branch `main`.
- Reason: oferecer instruções completas sem atribuir aos instaladores públicos v0.1.1 código que só existe após a tag.
- Verified: typecheck, lint, 7/7 testes, smoke e build passaram; links HTTP dos cinco assets públicos v0.1.1 retornaram 200. `orquestrador-maestro check-dev-gates --project-path . --strict` passou com 12 entradas.
- Limits: assets Windows/macOS foram publicados por CI, mas seguem sem instalação/runtime nativo; nenhum `.deb` instalado nem uso pago de ElevenLabs.
- Next context: release pública continua v0.1.1; `main` ainda declara 0.1.1 com código posterior à tag. Para distribuição nova, alinhar SemVer e autorização; validar hosts Windows/macOS nativos.

## 2026-11-05 — Pastas de projetos pelo título e contrato VideoGo
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/main/projects.ts` cria diretórios a partir do título, atribui sufixo numérico exclusivo em colisões e persiste o `folderName`; IDs UUID e nomes dos registros permanecem estáveis. Imports usam o título do projeto nativo. `storyboard.json` envia o slug em `id` e o título humano em `title`.
- Reason: encontrar projetos pelo nome e manter o identificador legível disponível para o VideoGo, sem sobrescrever pastas ou alterar referências internas.
- Verified: `npm run typecheck`, `npm run lint`, `npm test` (8/8), `npm run smoke` e `npm run build` passaram. O teste de runtime cobriu título com acentos, briefing inválido sem pasta órfã, colisão com arquivo sentinela, duplicatas com sufixos, importação e caminho recuperado após leitura do registro.
- Limits: pastas UUID já existentes permanecem como estão; nenhuma migração de dados ocorreu. O build ainda informa bundle renderer de 618.93 kB acima do limite de aviso.
- Next context: conferir a criação/importação por título no app empacotado; pastas UUID antigas só devem mudar com migração explícita e reversível.

## 2026-11-05 — Onboarding por objetivo e biblioteca de prompts
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/renderer/Setup.tsx` apresenta configuração orientada a carrossel/post ou vídeo, com o agente selecionado e o motor correspondente; ElevenLabs aparece como opção de voz, não requisito geral. `src/renderer/Studio.tsx` recolhe controles avançados e abre `PromptLibrary.tsx`; modelos de curiosidade, favoritos e prompts pessoais ficam em `prompt-library.ts` no perfil local, com teste em `tests/prompt-library.test.ts`.
- Reason: reduzir decisões de primeira utilização e revisar o prompt exato antes de chamar o agente, sem substituir PostNow/VideoGo nem ultrapassar a aprovação de narração/áudio.
- Verified: `npm run typecheck`, `npm run lint`, `npm test` (13/13), `npm run smoke`, `npm run build` e `orquestrador-maestro check-dev-gates --project-path . --strict` (passou; warnings históricos de recorrência); Chromium confirmou seleção de formato, requisito de voz opcional, modelo → composer, salvar/favoritar prompt pessoal e 0 violações axe, sem erros do renderer. Viewports 390/768/1280/1440 tiveram `body.scrollWidth` igual à largura; screenshot QA do diálogo mostrou biblioteca em uma/duas colunas conforme breakpoint.
- Limits: o preview não instalou motores, não iniciou agente nem usou TTS/API paga; secure storage fica indisponível no browser preview. Build mantém aviso do bundle renderer >500 kB; request externo a Google Fonts falhou no preview, com fontes locais/fallback exibidas.
- Next context: inspecionar o fluxo em Electron empacotado e hosts Windows/macOS continua pendente; favoritos/prompt pessoal armazenam-se no perfil local do renderer, não sincronizam para outro computador.

## 2026-11-05 — Jornadas intuitivas separadas para PostNow e VideoGo
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: wizard escolhe PostNow ou VideoGo antes do briefing, sugere nome pela pauta, oferece templates/prompt pessoal revisável e encaminha a próxima etapa real no Studio. ElevenLabs fica em Motores & Setup, com link direto desde o VideoGo, pré-requisitos de key/clonagem/FFprobe e gates de consentimento/aprovação preservados. Preview acompanha SemVer de `package.json`; versão local 0.2.0, sem alterar release pública v0.1.1.
- Verified: typecheck, lint, testes (18/18), smoke e build passaram; Chromium exercitou criação nos dois motores, interpolação portuguesa de prompt pessoal, composer sem iniciar agente, próxima etapa correta, gates de TTS/export e setup direto. Preferências não exibe ElevenLabs; a configuração fica em Motores & Setup. 390/768/1280/1440 sem overflow; 0 botões sem nome e 0 erros no fluxo limpo. `orquestrador-maestro check-dev-gates --project-path . --strict` passou com alertas de recorrência históricos. Smoke usou workspace temporário.
- Limits: Vite mantém aviso para bundle renderer de 653.08 kB (>500 kB). Preview não dispõe de cofre de sistema nem API key; ElevenLabs real, TTS pago, clonagem, Electron empacotado e runtime Windows/macOS não foram exercitados. Candidata 0.2.0 não foi empacotada/publicada, nem houve commit/push/tag.
- Next context: validar cofres e APIs ElevenLabs com autorização, teste empacotado em Electron e hosts Windows/macOS; só publicar 0.2.0 mediante autorização explícita.

## 2026-11-06 — Gate editorial e diagnóstico da geração PostNow
- Changed: revisão de copy, claims/fontes e prompts no Studio; aprovação editorial ligada a hash de conteúdo, brief, formato, logo e referências; Codex ImageGen só inicia após aprovação explícita e preflight real do PostNow. Preparação editorial não cria mais rodada vazia; versões sem mídia são ocultadas e arquivos legados `generated/slide-*.png` continuam visíveis.
- Diagnosis: os logs de Patricia mostravam uma recusa de geração por `copy_approved=false`/`claims_reviewed=false`; o app não mostrava como revisar/aprovar. Um diretório `.input` vazio de uma execução de preparação escondia os seis PNGs legados.
- Verified: typecheck, lint, 24/24 testes, smoke e build passaram; PostNow real processou três PNGs temporários 1080×1350 e aplicou logo; VideoGo real renderizou H.264 MP4 1080×1080. Chromium/Electron mostrou os seis PNGs legados, conteúdo/fonte e checkbox desmarcado. Não alterei o projeto Patricia nem gerei arte sem aprovação humana.
- Limits: geração Codex ImageGen no projeto Patricia não foi disparada: copy/claims jurídicos ainda aguardam revisão/aprovação explícita da pessoa. Build mantém aviso do bundle renderer >500 kB; Windows/macOS e TTS/clonagem paga não foram exercitados.

## 2026-11-06 — Lifecycle e confiabilidade dos motores
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: ciclo de vida de projetos com exclusão e clone; PostNow com lotes isolados, importação raster, aprovação da copy/claims/prompts ligada ao hash exato, aplicação da logo e exclusão de imagens mapeadas recuperável; VideoGo com derivação que respeita a rodada, aprovações e contagem do formato. Jornadas visuais mostram estados reais e não iniciam geração automaticamente.
- Reason: os erros observados vinham de gates editoriais invisíveis, lote vazio ocultando arquivos, separação incorreta entre geração artística e finalização PostNow, e conversões sem limite explícito de formato/quantidade.
- Verified: `npm run typecheck`, `npm run lint`, `npm test` (37/37), `npm run smoke`, `npm run build` e `orquestrador-maestro check-dev-gates --project-path . --strict` (12 entradas) passaram; PostNow real preparou três PNGs temporários 1080×1350 com logo; VideoGo real renderizou MP4 H.264 1080×1080; Electron isolado exerceu criação, clone, exclusão e invalidação do aceite. Uma chamada real Codex ImageGen em workspace descartável, após aprovação editorial explícita, terminou `succeeded`/exit 0 e PostNow finalizou 1 PNG 1080×1350 em lote `ready`; nenhum vídeo iniciou e a imagem não foi aprovada para exportação. O erro interno recuperável `Argument list too long` não impediu a conclusão. O fixture inicial de logo era totalmente transparente; o overlay foi confirmado visualmente via CLI com fixture opaco.
- Limits: apenas um post único real do ImageGen; multi-página/outros formatos não exercitados. Sem chamada real ElevenLabs/clonagem; Patricia somente leitura. Bundle >500 kB; validação empacotada/Windows/macOS pendente. Sem commit, tag, push, merge ou publicação.
- Next context: não repetir geração paga sem consentimento específico; manter Patricia intacta; testar multi-página e plataformas nativas com fixtures descartáveis.

## 2026-11-06 — Carrossel Instagram: QA E2E, terminal e exportação
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/main/permissions.ts` (novo) concede somente `clipboard-sanitized-write`; `src/main/electron.ts` usa esse allowlist no `setPermissionRequestHandler`; `tests/permissions.test.ts` (novo). Política de logo por rodada (`src/shared/logo-policy.ts`, novo) e `depicted_person` por página (`src/shared/depicted-person.ts`, novo) entram na composição do prompt no sync (`src/main/content/postnow.ts`), na validação do projeto (`src/main/projects.ts`) e na UI (`src/renderer/Studio.tsx`). Documentação: `DEV/IMPLEMENTATION.md`, `DEV/DECISIONS.md` (ADR-007 e ADR-008), `DEV/TESTING.md` e `DEV/SPECS/ACTIVE.md`.
- Reason: o terminal não copiava porque o Electron negava a permissão de clipboard; o motor precisava de logo e `depicted_person` explícitos por página; o smoke falhava sem `generation_policy`, `depicted_person` e marcadores de prompt no `project.json` do motor.
- Verified: `typecheck`, `lint`, `npm test` 49/49, `npm run smoke` (`ok: true`) e `npm run build` passaram. Electron isolado: "Copiar seleção", "Copiar tudo" e Ctrl+C com seleção copiaram o texto esperado; Ctrl+C sem seleção manteve o clipboard. Carrossel fictício de 5 páginas: lote `1793977196498-2e51db64` `ready`, 5 PNGs 1080×1350, logo na mesma caixa em todas as páginas (checado por pixels). Cinco saídas aprovadas pela UI e exportadas com `maquina.export/v1`; sha256 do manifesto igual ao dos PNGs do lote; nenhum vídeo.
- Limits: uma chamada paga do Codex ImageGen, autorizada pelo objetivo do goal ativo. Diálogos nativos de importação e exportação foram contornados por IPC (`projects.importAsset`, `projects.export`), com fixtures sintéticos e destino fora do projeto. `depicted_person: "none"` foi acrescentado à mão nas 5 páginas do fixture (backup `/tmp/mdc-imagegen-e2e.QASmnt/project.json.before-depicted.json`). Aprovações antigas da Versão 2 (resíduo de QA) foram removidas antes da exportação. ElevenLabs não executado; Windows/macOS não exercitados; `client_portrait` adiado, pois exige `postnow client set-portrait`, que o Studio não gerencia.
- Next context: pergunta interativa para jobs (pedido do maestro) precisa de spec: `JobInteractionRequest` já existe, mas jobs de imagem rodam com `interactive: false`. Pendentes: skeleton de criação sem mudança; wizard ainda não edita `audience`, `promise` e `cta`. Observação de design: o logo é quadrado laranja opaco com miolo branco e aparece como bloco sólido em todas as páginas; sem mudança.

## 2026-11-06 — Etapas do Studio, revisão por imagem, exclusão e ZIP
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/shared/contracts.ts`, `src/renderer/project-journey.ts`, `src/renderer/studio-steps.tsx`, `src/renderer/Studio.tsx`, `src/renderer/styles.css`, `src/shared/image-revision.ts`, `src/shared/agent-followup.ts`, `src/main/agents.ts`, `src/main/projects.ts`, `src/main/open-folder.ts`, `src/main/runtime.ts`, `src/main/electron.ts`, `src/main/zip.ts`, `src/main/context.ts`, `src/main/content/native.ts`, `tests/` (open-folder, zip, agent-followup, image-revision, project-journey, runtime), `DEV/**`.
- Reason: fechar fluxos de revisão e entrega do Studio, impedir decisões sobre rodada incompleta, permitir exclusão recuperável, exportar ZIP e abrir pastas escolhidas sem travar o processo principal.
- Verified: typecheck e lint com exit 0; `npm test` 69/69; `npm run smoke` com `ok: true`; `npm run build` com exit 0 (aviso >500 kB pré-existente). Electron isolado: imagens Codex (carrossel v1 e revisão v2) e PostNow; vídeo VideoGo de 5 s; revisão; exclusão por tile e lightbox; ZIP e pasta; follow-up de agente; headline/claims; responsividade 920/640/560 px; console do renderer sem erros; restart do app real sem jobs convertidos. Evidência e IDs em `DEV/VERIFY.md`.
- Limits: Windows/macOS não exercitados (`shell.openPath` fora do Linux não verificado); narração ElevenLabs fora do escopo; console monitorado só no renderer; janela Wayland inspecionada via CDP; perguntas dos agentes em nova sessão, e após reinício o pedido original cai no fallback; gates de `Studio.tsx` sem re-indentação (dívida de estilo).
- Next context: decidir o formato do vídeo 4:5 → 9:16 (letterbox antes da derivação ou aceitar o corte) e o título derivado do id no VideoGo (`storyboard.ts` l.117, repo irmão); validar Windows/macOS; não repetir geração paga sem autorização específica.

## 2026-11-07 — Frentes de geração: feedback, editor, formatos, sem recorte e referências
- Spec: DEV/SPECS/ACTIVE.md
- Changed: src/shared/agent-events.ts, src/shared/visual-text.ts, src/shared/contracts.ts, src/shared/formats.ts, src/shared/brand-references.ts, src/main/supervisor.ts, src/main/notifications.ts, src/main/electron.ts, src/main/agents.ts, src/main/projects.ts, src/main/context.ts, src/main/content/postnow.ts, src/main/content/native.ts, src/renderer/GenerationProgress.tsx, src/renderer/VisualTextEditor.tsx, src/renderer/VideoSceneEditor.tsx, src/renderer/Studio.tsx, src/renderer/Projects.tsx, src/renderer/project-journey.ts, src/renderer/state.ts, src/renderer/App.tsx, src/renderer/styles.css, tests/brand-references.test.ts, tests/context.test.ts, tests/visual-text.test.ts, README.md, DEV/**
- Reason: Entregar as cinco frentes pedidas: feedback durante a geração; editor de texto para imagem e vídeo; formatos no início (story 9:16, feed 1:1, 4:3 e 4:5; imagem única ou carrossel); imagem inteira do Codex ImageGen, sem recorte nem composição, com Refazer pelo ImageGen; referências da marca usadas na geração e na correção. Etapa Textos sem prompts (ADR-017).
- Verified: typecheck e lint sem erros; `npm test` 102/102; `npm run build` 709.88 kB; `npm run smoke` com `"ok": true`. E2E isolado com stand-in do Codex, sem geração paga: carrossel 1:1 `ready` com `.input` 1024×1024 → 1080×1080 sem corte, e Refazer mantendo as páginas não refeitas; carrossel 4:5 recusado com `failed` por proporção, sem arte final; sincronização headline → arquivo de arte e teste negativo; balão de atividade; console do renderer sem erros. IDs em `DEV/VERIFY.md`.
- Limites: 4:3, 4:5 e 9:16 não fecham em 1% com ImageGen; `--image` com Codex real não comprovado (apenas argv do stand-in); logo segue como camada pós-geração; editor de vídeo sem verificação visual; notificação nativa não verificada; Windows e macOS não exercitados; app do usuário não reaberto (storage somente leitura).
- Next context: decidir o formato 4:5/4:3/9:16 com ImageGen (ADR-015), a política de logo, `client_portrait` e o crop de vídeo (`DEV/DECISIONS.md`, "Decisões pendentes"); geração paga só com autorização específica.

## 2026-11-07 — Teste local do motor PostNow: páginas mínimas do carrossel
- Spec: nenhuma (correção pontual)
- Changed: `src/main/setup/engines.ts` (`testEngine`, linha 197): o cadastro temporário de teste usa `--page-count 3` (antes `1`).
- Reason: o motor PostNow 09a9217 recusa carrossel com menos de 3 páginas (`postnow/clients.py`, "Um carrossel precisa ter pelo menos 3 páginas"); o botão Testar falhava logo após a atualização do motor.
- Verified: `manageEngine('postnow','update')` e `testEngine('postnow')` reais, em dataDir temporário, com `saveSettings` em memória: motor 09a9217 validado e ativado; teste local passou com logo aplicada. `npm run typecheck`, `npm run lint` e `npm test` (102/102) passaram. Motor 09a9217 isolado: `client add`, `client list`, `client set-logo` e `project create --format carousel-4x5 --page-count 6 --approve-page-count` com rc 0.
- Limits: `dist/` não reconstruído; o botão Testar só usa a correção após `npm run build` e reinício do app. Geração de imagens (Codex) não executada. Atualização do dataDir real do usuário não feita.
- Next context: após atualizar o PostNow pela UI, geração paga só com autorização específica.

## 2026-11-07 — PostNow: rodada Codex que se marcou `ready` sozinha
- Spec: `DEV/SPECS/ACTIVE.md` (regra de entrega PostNow, L85)
- Changed: `src/main/agents.ts` (prompt da tarefa de imagem: a única escrita permitida é `generated/runs/<id>/.input/slide-NN.png`); `src/main/content/postnow.ts` (`isRoundDelivered`, exportado: exige `.status.json` `state: ready` e `.mapping.json` regular; `finalizePostNowBatch` recusa rodada já entregue só com esse predicado); `tests/postnow-round-delivery.test.ts` (novo, 3 casos).
- Reason: a rodada `1794081096157-9d053e34` falhou com "Esta rodada já está pronta e não será sobrescrita."; o agente Codex gravou `.status.json` `state: ready` antes da finalização e o catch de `agents.ts` gravou `failed`. Antes, `enginePaths.postnow` apontava para o motor `5452c5a02bd3`, que não reconhece `--format carousel-4x5`; o motor atual é `09a9217` (commit PostNow `09a9217`).
- Verified: `npm run typecheck`, `npm run lint`, `npm test` (105/105), `npm run build` (aviso >500 kB pré-existente) e `npm run smoke` (`"ok": true`). Finalize offline em cópia temporária, motor 09a9217, sem Codex: com `ready` escrito à mão, a finalização foi recusada antes da correção; depois, concluiu com 6 PNGs 1080×1350, logo nas páginas 1 e 6, `.mapping.json` com `revision.of` e páginas 2–5 `reusedFrom`; a segunda tentativa foi recusada. Ajuste de proporção sobre os 6 PNGs reais da rodada `9d053e34` (Pillow 13.0.0 do motor): slides 01 e 06 de 1122×1402 RGB → 1080×1350 RGBA (`adjusted: true`, desvio 0,036%); slides 02–05 de 1080×1350 sem ajuste. App reiniciado com `npm start` (`ELECTRON_WINDOW_READY`, modo persistente).
- Limits: nenhuma geração Codex foi disparada. "Gerar nova versão de 2 imagens" e "Gerar 6 imagens com Codex" aguardam clique do usuário. A rodada `9d053e34` é `failed` e não reutilizável. A restrição de escrita do agente é só do prompt; se o agente gravar `ready` e `.mapping.json`, a guarda recusa a finalização. Arquivos de `DEV/` do projeto Patricia modificados pela rodada `9d053e34` (16:59–17:03 local) não têm backup, e o projeto não é repositório git.
- Next context: observar a próxima rodada em `generated/runs/<id>/.status.json` e `history/jobs.json` até `ready` ou `failed`; não repetir geração paga sem novo clique.

## 2026-11-07 — Recorte 4:5 centralizado (ADR-018) e rodada PostNow que falhou por 1%
- Spec: `DEV/SPECS/ACTIVE.md` (L44, L87); `DEV/DECISIONS.md` (ADR-018; ADR-015 parcialmente superseded).
- Changed: `src/main/content/conform.ts` (novo: `planCenterCrop`, `parseImageSize`, `PROBE_SCRIPT`, `CONFORM_SCRIPT`, `MAX_CROP_PERCENT_PER_SIDE = 3`); `src/main/content/postnow.ts` (finalize: probe, plano, conform; recusa com mensagem de recorte); `src/main/agents.ts` (prompts GERE, REFAÇA e REQUEST citam o recorte; mensagem de páginas ajustadas); `src/main/projects.ts` (mesma mensagem); `tests/postnow-crop-plan.test.ts` (novo, 7 casos); `README.md`, `DEV/IMPLEMENTATION.md`, `DEV/DECISIONS.md`, `DEV/SPECS/ACTIVE.md`, `DEV/VERIFY.md`, `DEV/WORKLOG.md`, `DEV/HANDOFF.md`.
- Reason: a rodada `1794090447511-af60e76f` falhou com 6 páginas 1092×1440 (razão 0,758 contra 0,8; desvio de 5,2%), recusadas pela tolerância de 1% do ADR-015. A usuária escolheu o recorte centralizado (opção B), sem custo e sem trocar o gerador. O limite de 3% por lado é proposta do agente.
- Verified: `npm run typecheck` e `npm run lint` sem erro; `npm test` 112/112; `npm run build` (renderer `index-BlFQd9j3.js`, 709.88 kB; aviso >500 kB pré-existente); `npm run smoke` com `"ok": true`. Offline com os 6 PNGs reais da rodada: 1092×1440 → 1080×1350, cortes de 37 px no topo (2,57%) e 38 px na base (2,64%). Smoke temporário com entrada 1092×1440: `"ok": true`, saída 1080×1350, script removido. Aceite de `planCenterCrop` sobre 230 PNGs em `~/.codex/generated_images`: 4:5 110 (47,8%), 1:1 16, 9:16 7, 4:3 2. App reiniciado com `npm start` (pid 551942, `ELECTRON_WINDOW_READY`, dist de 20:03).
- Limits: nenhuma geração Codex. Limite de 3% não aprovado pela usuária. A paisagem 1672×941 (7 das 50 saídas mais recentes) exige ~27% por lado e segue recusada. Inspeção visual dos PNGs, sem medição por pixel. Windows/macOS não verificados. Geração real pendente de clique da usuária.
- Next context: se a usuária autorizar, clicar em "Gerar 6 imagens com Codex" (paga) e observar `.status.json`. Decisões pendentes: limite (3% atual; 10% daria 119/230, com cortes de até 8,3%) e 4:3/9:16 (`DEV/DECISIONS.md`, pendência 1).
