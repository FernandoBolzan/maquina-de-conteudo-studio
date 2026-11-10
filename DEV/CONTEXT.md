# Context — Máquina de Conteúdo (Studio)

## State

- Release pública `v0.1.1` (Linux x86_64, Windows x64, macOS arm64). O checkout atual declara `0.2.0` em `package.json`/lockfile como candidata local não publicada; README e runbook separam claramente a candidata da release pública. Nenhum commit, tag, push ou artefato de distribuição foi criado para 0.2.0.
- ElevenLabs é estruturado como submenu dedicado de Motores & Setup (`engines` e `elevenlabs`) acessível na sidebar e em tabs in-page: `safeStorage` cifra a key; o Studio oferece catálogo pesquisável de vozes com preview de áudio sob demanda, instruções de clonagem em passos com consentimento formal, aprovação de texto vinculada por hash e confirmação/aprovação individual do áudio. A key segue apenas no processo filho e `VIDEOGO_NO_VOICE_CACHE=1` evita persistência no cache. Áudio próprio por cena (upload ou gravação no Modo Studio) funciona sem voz ElevenLabs (ADR-024).
- Novos projetos/importações usam diretórios derivados do título; o UUID permanece como ID interno/arquivo de registro. VideoGo recebe slug em `storyboard.id` e título em `storyboard.title`; projetos existentes preservam os diretórios UUID.
- Verificação recente (2026-11-09, Motores & Setup submenu + layout redesign): typecheck e lint sem erros; `npm test` 223/223; smoke `"ok": true`; build ok; Browser API Chromium headless validou alternância de abas/submenus, painel ElevenLabs dedicado com preview de áudio e 0 overflow em 390/768/1280/1440 px; `check-dev-gates --strict` registrado em `DEV/VERIFY.md`. Electron nativo aguarda reinício; sem chamada paga ElevenLabs. Histórico em `DEV/VERIFY.md`.

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
