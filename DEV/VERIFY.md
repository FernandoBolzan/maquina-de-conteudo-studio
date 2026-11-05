# Verify — Máquina de Conteúdo (Studio)

- Date: 2026-11-05
- Scope: release pública `v0.1.1`, feeds do updater, pacote Linux e fluxos visuais no AppImage.
- Passed: Actions run `42045235690` concluiu builds Linux/Windows/macOS e publicação. Os feeds públicos `latest-linux.yml`, `latest.yml` e `latest-mac.yml` apontam para assets existentes com nomes correspondentes.
- Observed: a primeira consulta do updater retornou HTTP 504; uma consulta posterior pela UI do AppImage informou “Você está na versão atual (0.1.1)”. Não houve download nem instalação de atualização.
- Pending: instalação/fluxos nativos Windows/macOS, assinatura/notarização, macOS Intel, instalação do `.deb` via `apt` e update real entre versões diferentes.

## Latest Verification

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: passou, 7/7; inclui segurança da chave ElevenLabs e bloqueio de síntese antes da aprovação explícita.
- `npm run smoke`: passou com defaults Linux e com `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO`, `MDC_SMOKE_MAESTRO`.
- `npm run build`: passou; chunk renderer 615,40 kB excede o aviso de 500 kB.
- `npm run dist:linux`: passou; AppImage local 122.062.829 bytes e `.deb` 92.381.148 bytes. `dpkg-deb --field` confirma pacote `maquina-de-conteudo`, versão `0.1.1`, arquitetura `amd64`.
- AppImage 0.1.1 abriu em perfil e workspace temporários; projetos/marcas começaram vazios. Criado projeto VideoGo temporário; painel de narração exibiu controles e manteve salvar/aprovar/gerar bloqueados sem configuração. Nenhuma API ElevenLabs, voz clonada ou geração paga foi acionada.
- Preferências: `safeStorage` sem cofre seguro neste host Linux; a UI bloqueou guardar API key e não recorreu a texto puro. O workspace de QA foi isolado em `/tmp`; nenhum projeto real foi alterado.
- Console do renderer e erros do browser: vazios durante a sessão de QA. Consulta do updater na UI registrou versão atual `0.1.1`; nenhum pacote foi baixado.
- VideoGo real: render de storyboard de teste concluído com `--voice demo`, saída MP4 validada com `ffprobe`; pasta temporária removida.
- Maestro real: contexto local de teste validado sem chamada de modelo; pasta temporária removida.
- PostNow: UI detectou Python 3.12.3 e ausência de Pillow no ambiente selecionado; render não executado e dependência não instalada.
- UI Chromium: Setup e Preferências verificados em 390/768/1280/1440 px; zero overflow horizontal, zero botões sem nome e zero erros novos. Estado de atualização disponível testado anteriormente com IPC simulado, sem baixar pacote.
- `orquestrador-maestro check-dev-gates --project-path . --strict`: passou com 12 entradas. Avisou hotspots no histórico (`package.json` 5; workflow release, `DEV/**` e README 3 cada; `src/main/electron.ts` 3). O worklog mostra mudanças distintas de versão/dependências, correções do workflow, atualizações documentais e recursos do Electron; não demonstra uma causa técnica única. `check-recurrence --write` não estava disponível no PATH (exit 127); nenhum patch de código foi feito por esse aviso.
- README: links diretos da v0.1.1 conferidos com a lista pública de assets e `latest-linux.yml`, `latest.yml`, `latest-mac.yml`; comandos de desenvolvimento conferidos com `MDC_DEV_URL` em `src/main/electron.ts`.

## Validação local prévia à publicação

- No snapshot anterior ao bump de versão: typecheck, lint, `npm test` (6/6), `npm run smoke`, smoke com overrides, build e `dist:linux` passaram.
- Aquele build local 0.1.0 produziu AppImage 121.374.248 bytes e `.deb` 92.272.280 bytes; o AppImage abriu em perfil temporário e o `.deb` teve metadata verificado, sem instalação `apt`.
- Actions run `42040288628` construiu `v0.1.0`, mas uploads falharam por `:` nos nomes. A run `42041326153` corrigiu uploads, mas macOS recebeu HTTP 504 durante empacotamento. A run `42042527532` publicou a release `v0.1.0`.
- O feed v0.1.0 referia nomes que não correspondiam aos assets publicados. O template `artifactName` foi corrigido no código de release e o pacote foi bumpado para `0.1.1`.
- No snapshot anterior à publicação de `v0.1.1`, os builds locais foram gerados e smoke paths ficaram configuráveis por `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO` e `MDC_SMOKE_MAESTRO`. Depois, a Actions run `42045235690` publicou os manifests corrigidos.

## Histórico de publicação

- Commit inicial `80cc1e5` e tag anotada `v0.1.0` foram publicados; release permanece imutável.
- Primeiro upload falhou com nomes inválidos; tentativa seguinte teve falha transitória HTTP 504 no build macOS.
- Retry manual `42042527532` publicou `v0.1.0` e todos os assets.
- Commit `77cf59c` corrigiu `artifactName` para alinhar feeds e assets; tag anotada `v0.1.1` disparou Actions run `42045235690`, sucesso nos três builds e publicação.
- API pública confirma `v0.1.1` como latest. `latest-linux.yml`, `latest-mac.yml` e `latest.yml` foram lidos; os caminhos dos pacotes Linux, macOS e Windows correspondem aos nomes dos assets.

## Commands

```bash
npm run typecheck
npm run lint
npm test
npm run smoke
npm run build
npm run pack
orquestrador-maestro check-dev-gates --project-path . --strict
```

## Previous Release Packaging Verification (2026-11-05)

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 2/2 (runtime security invariants and AppImage-only Linux update policy).
- `npm run build`: passed; Vite reports renderer chunk >500 kB.
- `npm run pack`: passed on Linux x86_64; electron-builder loaded the GitHub publish config and produced `release/linux-unpacked`. Explicit `--publish never` prevented implicit publishing in CI.
- `npm run dist:linux`: passed with `--publish never`; produced x86_64 AppImage and Debian artifacts.
- Final AppImage launched directly through FUSE, without `--appimage-extract-and-run` or `--no-sandbox`; onboarding and project creation/persistence through the UI passed in `/tmp/maquina-appimage-final-workspace`.
- Packaged Linux binary returned the package-manager-only update message for the non-AppImage target without contacting GitHub; `tests/update-policy.test.ts` covers Linux AppImage vs other target platforms.
- `.github/workflows/release.yml`: YAML parsed successfully; local tag-rule check accepted `v0.1.0` and rejected mismatched `v0.1.1`. GitHub Actions itself was not run.
- No Git tag was created/pushed and no GitHub Release was published.
- `orquestrador-maestro check-dev-gates --project-path . --strict`: passed; warns of repeated worklog touches to `package.json` (4 entries) and `src/main/electron.ts` (3 entries); these were separate branding, release, and update-policy changes rather than repeated test failures.

## Not Verified Here

- Lookup público da release e leitura dos três feeds foram exercitados; a consulta pelo app informou que `0.1.1` já era a versão atual. Nenhum download/instalação de update foi tentado.
- Instalação manual do `.deb` com apt, instalação/fluxos nativos Windows/macOS, assinatura/notarização e macOS Intel não foram exercitados.
- Geração paga ElevenLabs, clonagem real e autenticação interativa não foram acionadas.

## Review

```yaml
id: PKG-001
severity: low
finding: The Debian package initially failed because electron-builder required project homepage metadata.
action: Added the official product homepage and correct top-level desktopName metadata; AppImage and deb then built successfully.
```

## Reported Origin Message

During CDP inspection, the test harness navigated an AppImage window to the development renderer path; the IPC origin guard correctly rejected that mismatched page and displayed “Origem não autorizada.” Reopening the AppImage's own `app.asar` renderer path, then restarting `npm start` at its matching development path, loaded both normally with no renderer errors. No project data was modified by this navigation.

## Outcome
- Passaram typecheck, lint, 7/7 testes, smoke com defaults/overrides, build e `dist:linux`; QA do AppImage e gates DEV strict passaram.
- Linux v0.1.1: AppImage abriu em workspace descartável, fluxo de projeto/narração e Preferências observados; `.deb` metadata verificado, sem instalação apt.
- Release pública `v0.1.1` e feeds Linux/Windows/macOS confirmados. Windows x64 e macOS arm64 foram compilados/publicados por Actions, mas ainda sem instalação/execução em hosts nativos.

## 2026-11-05 — ElevenLabs v4 no Studio

- Studio: `npm run typecheck`, `npm run lint`, `npm test` (7/7) e `npm run build` passaram. Vite reportou bundle renderer 616.16 kB acima do aviso de 500 kB.
- Runtime offline simulou `/v2/voices` e cofre cifrado: key ausente de `settings.json` e armazenada cifrada; síntese bloqueada antes de aprovar; mudança no texto após aprovação invalida o hash; asset de áudio apagado deixa de contar como pronto; zero chamadas TTS e nenhuma API externa real.
- `npm run smoke` passou: 3 projetos, 1 marca, VideoGo ligado, PTY cancelado conforme cenário.
- QA Chromium no preview compilado: projeto VideoGo de teste, edição/salvamento do texto, botões Aprovar/Gerar bloqueados sem cofre/voz, Preferências com instruções de API/clonagem; viewport 390×844 com `scrollWidth=390`, erros de console/renderer vazios.
- VideoGo: `npm run typecheck`, `npm test` (49 core + 20 flicker), `npm run test:external-audio` e `npm run build` passaram. E2E confirmou render audível com fixture sintética e `--voice demo` sem duplicação.
- Não executado: chamada ElevenLabs paga ou clonagem real; escuta humana de voz Eleven v4; testes Electron nativos Windows/macOS.
## 2026-11-05 — Setup ElevenLabs em Motores & Setup

- Design-system discovery resolveu `@./components` com confiança 0.90; mudança de posição reaproveita os componentes e estilos existentes, sem redesign.
- O painel de API key, biblioteca, clonagem e instruções está agora em Motores & Setup, após os cartões dos motores de conteúdo. Preferências não contém mais configuração ElevenLabs.
- Chromium preview: baseline captured on Preferências before editing. After build, “Voz e narração do VideoGo” is visible in Motores & Setup after the content-engine cards; Preferências has no ElevenLabs or voice-setup text. At 390×844, document `scrollWidth=390`; no browser errors.
- Studio gates passed: `npm run typecheck`, `npm run lint`, `npm test` (7/7), `npm run smoke` and `npm run build`. Vite reports the existing renderer chunk warning at 618.93 kB (>500 kB).
