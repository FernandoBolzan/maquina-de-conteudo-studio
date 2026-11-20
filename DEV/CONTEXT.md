# Context — Máquina de Conteúdo (Studio)

## State

- Release pública `v0.1.1` (Linux x86_64, Windows x64, macOS arm64). O checkout atual declara `0.2.0` em `package.json`/lockfile como candidata local não publicada; README e runbook separam claramente a candidata da release pública. Nenhum commit, tag, push ou artefato de distribuição foi criado para 0.2.0.
- Motores & Setup separa assistentes/CLIs, motores PostNow/VideoGo/Maestro e ferramentas do computador; Cloudflare Tunnel é ferramenta de sistema, não motor. ElevenLabs permanece em submenu próprio e opcional para narração VideoGo, com `safeStorage`, catálogo pesquisável e clonagem com consentimento; configuração preserva aprovação hash-bound, geração autorizada e key fora de settings/renderer. Desktop usa subnav da sidebar; em ≤920 px, tabs in-page a substituem. Breadcrumb completo em 320–1440 px.
- Novos projetos/importações usam diretórios derivados do título; o UUID permanece como ID interno/arquivo de registro. VideoGo recebe slug em `storyboard.id` e título em `storyboard.title`; projetos existentes preservam os diretórios UUID.
- Verificação mais recente (2026-11-16, UX Motores & Setup): typecheck, lint, 296 testes, build e smoke isolado passaram; preview Chromium confirmou sem overflow nem truncamento do breadcrumb em 320/390/768/1024/1440, alternância por teclado, estado sem key/cofre e busca/filtro/erro com fixture sintética. A sequência composta teve uma falha de smoke na proteção POSTNOW_HOME em /tmp; o smoke isolado passou depois, sem causa identificada. Sem Electron nativo nem chamada/áudio ElevenLabs. Evidência detalhada e capturas em `DEV/VERIFY.md` e `.frontend-excellence/visual-qa/`.

## Commands

```bash
npm run typecheck
npm run lint
npm test
npm run smoke
npm run build
npm start
npm run dist:linux
npm run dist:windows
npm run dist:mac
orquestrador-maestro check-dev-gates --project-path . --strict
```

## Constraints And Risks

- Windows/macOS exigem validação nativa de instaladores, PTY, diálogos e caminhos. A Actions run `42045235690` compilou/publicou Windows x64 e macOS arm64; build de CI não equivale a teste de instalação/runtime.
- O smoke (`scripts/smoke.ts`) aceita `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO` e `MDC_SMOKE_MAESTRO`; defaults PostNow/VideoGo são irmãos e Maestro usa caminho Linux somente no Linux. Smoke passou com defaults e overrides no Linux; smoke nativo pendente.
- CLI logins são interativos e permanecem nos CLIs oficiais; geração paga de modelos/voz requer autorização do usuário.
- Autoatualização usa a release estável mais recente de `FernandoBolzan/maquina-de-conteudo-studio`; `package.json` é fonte SemVer e tags anotadas `vX.Y.Z` acionam `.github/workflows/release.yml`. `workflow_dispatch` também publica a tag selecionada; usar só com autorização. Linux AppImage atualiza pelo app; `.deb` pelo gerenciador. Consulte `DEV/RUNBOOKS/RELEASES.md`.
- Pacotes Linux são x86_64. O builder usa o ícone Electron padrão enquanto não houver ícones de distribuição configurados. A UI bloqueia guardar API key se o cofre do sistema não estiver disponível; neste host Linux não havia Secret Service/KWallet operacional.
- O gate editorial PostNow é intencional: confirme copy, claims/fontes e prompts da versão atual no painel do projeto antes de autorizar Codex ImageGen. Alterações no conteúdo, marca/referências, formato ou briefing invalidam a aprovação; não aprove conteúdo jurídico automaticamente.
- Resíduo root-owned em `~/.codex/tmp/arg0-linux` (ADR-026): não removido (exige root); origem não confirmada.
- Storyboard fora do contrato VideoGo v1 é aviso no Studio, não bloqueio (ADR-032). `src/shared/storyboard-contract.ts` espelha `../VideoGo/src/services/production/storyboard.ts` sem sincronização automática; VideoGo em `5406fc0` (commit externo a esta rodada).
- Chave ElevenLabs real não validada; `codex exec` não executado (E3 e AC13 ii pendentes); `tests/narration-stray.test.ts` depende de ffmpeg no host.

## Next Context

- Artefatos públicos v0.1.1: Linux x86_64, Windows x64 e macOS arm64. A candidata local 0.2.0 não foi empacotada nem publicada. Validar Electron distribuído e hosts nativos Windows/macOS; somente publicar com autorização explícita.
- Pendências 9–13 aguardam a usuária (`DEV/DECISIONS.md` L256–260; default "manter" aplicado); pendências 1–8 não tratadas. Validação pós-job do storyboard (AC13 iii) e releitura antes de `apply_patch` (AC13 ii) não implementadas.
- Atualização de Motores & Setup registrada em `DEV/VERIFY.md`: reiniciar Electron para carregar os assets novos; keychain real, conta ElevenLabs e reprodução de áudio permanecem sem validação e exigem autorização.
