# Worklog — Máquina de Conteúdo

## 2026-11-05 — Auditoria final do pacote Linux e alvos nativos
- Spec: DEV/SPECS/ACTIVE.md
- Changed: somente evidências operacionais em `DEV/**`; nenhum código de runtime alterado nesta auditoria.
- Reason: Revalidar o worktree atual e separar comportamento comprovado no Linux de builds que exigem hosts Windows/macOS.
- Verified: typecheck, lint, 5/5 testes, smoke, build AppImage/deb e gates strict; AppImage abriu sem flags de bypass; onboarding, criação de projeto/marca, diagnóstico Setup e estado estável Codex/Claude passaram; `.deb` mostrou o caminho de update pelo gerenciador do sistema. `npm start` foi restaurado após Xwayland voltar a aceitar conexões.
- Limits: `dist:windows` e `dist:mac` tentados no Linux falharam no rebuild de `node-pty` via node-gyp. QEMU existe, mas não há `/dev/kvm` nem imagem/VM Windows local; também não há hosts SSH configurados. GitHub Actions/releases públicas: zero execuções e zero releases. Testes nativos e publicação remota seguem pendentes.


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
