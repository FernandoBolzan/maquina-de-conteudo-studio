# Worklog — Máquina de Conteúdo


## 2026-11-05 — Fluxo Studio ElevenLabs v4 e narração aprovada
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `src/main/elevenlabs.ts`, `src/main/runtime.ts`, `src/main/projects.ts`, `src/renderer/Setup.tsx`, `src/renderer/Studio.tsx`, contratos, testes e instruções de uso.
- Reason: Configurar key cifrada, escolher/clonar voz e gerar áudio por cena somente após aprovação hash-bound da narração; cada clipe também requer aprovação antes do render final.
- Verified: typecheck, lint, 7/7 testes, smoke, build; teste offline de segredo e bloqueio pré-aprovação; Chromium preview em 390 px sem overflow e sem erros. VideoGo: typecheck, core 49/49, flicker 20/20, E2E de áudio externo e build.
- Limits: nenhuma API paga ou clonagem real; no preview sem cofre, key e voz permanecem indisponíveis. Correção do mantenedor em `listVoices`/`cloneVoice` do VideoGo não foi tocada.
## 2026-11-05 — QA final Linux e release v0.1.1

- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: `package.json`, `package-lock.json`, workflow de release, smoke configurável e README com guia completo, links diretos v0.1.1, instalação, motores, segurança e status por plataforma; documentação operacional em `DEV/**`.
- Published: release pública `v0.1.1`; Actions run `42045235690` concluiu build e publicação Linux, Windows e macOS. Feeds públicos e nomes dos assets foram conferidos.
- Reason: alinhar `artifactName` aos manifests do updater e oferecer uma página inicial completa com downloads versionados, uso e limites sustentados por evidência.
- Verified: typecheck, lint, 7/7 testes, smoke Linux default/overrides, build, `dist:linux` e `check-dev-gates --strict` (12 entradas; aviso de recorrência em `DEV/VERIFY.md`); AppImage abriu em workspace isolado, projeto VideoGo e bloqueios de narração sem key/voz verificados. Links do README conferidos com os assets e manifests públicos v0.1.1; instrução de desenvolvimento conferida com `MDC_DEV_URL`. Console/renderer errors vazios.
- Limits: `.deb` não instalado com apt; Windows/macOS nativos, assinatura/notarização e macOS Intel não validados. Sem key, clone ou geração ElevenLabs paga. Update entre versões distintas não exercitado.
- Next context: `v0.1.1` pública; manifests e nomes alinhados. Próxima lacuna: instalação/fluxos em hosts nativos; não republicar sem necessidade/autorização.


## 2026-11-05 — Diagnóstico e testes locais dos motores
- Spec: `DEV/SPECS/ACTIVE.md`
- Changed: dependências tipadas/diagnóstico e receitas FFprobe, testes consentidos em diretório temporário, aviso/data de atualização, UI responsiva e README; fixtures ajustadas ao contrato de armazenamento seguro já presente no worktree.
- Reason: Explicar o que cada motor precisa, permitir verificar o render sem tocar projetos do usuário e tornar o estado de atualização visível sem interromper a criação.
- Verified: typecheck, test (6/6), smoke e build; lint focado nos arquivos deste recurso. Preview Chromium validado em 390/768/1280/1440 sem overflow, botões sem nome ou erros novos. VideoGo produziu MP4 local com `--voice demo`; Maestro montou contexto sem chamar IA; aviso de update disponível foi exercitado com resposta IPC simulada.
- Limits: `npm run lint` ainda falha em três símbolos não usados de `src/main/projects.ts` (`NarrationState`, `listElevenLabsVoices`, `narrationState`), código de narração em evolução fora deste escopo. PostNow foi diagnosticado sem Pillow no ambiente selecionado, portanto o render smoke não foi executado; nenhum pacote/dep foi instalado. Update remoto não disponível no preview.
- Next context: Instalar/vincular PostNow com Pillow para exercitar render; resolver lint da integração de narração antes de considerar a qualidade global concluída.

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
