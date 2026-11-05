# Verify — Máquina de Conteúdo (Studio)

- Date: 2026-11-05
- Scope: Onboarding inicial, ciclo Codex/Claude e baseline de release/empacotamento Linux.
- Passed: typecheck, lint, `npm test` (5/5), smoke, build AppImage/deb, QA Chromium do onboarding/projeto/marca, consulta CLI estável e gates strict.
- Failed: `npm run dist:windows` e `npm run dist:mac` falham em cross-build no host Linux; run `42040288628` compilou os três alvos nativos, mas falhou ao enviar artefatos com nome contendo `:`.
- Pending: publicação da release após corrigir nome inválido de artefato no workflow; download/update real, instalação manual Windows/macOS, assinatura/notarização, instalação real de CLI e login.

## Latest Verification

- `npm run typecheck`: passou após contrato de onboarding, migração de perfil, state de CLI e handlers.
- `npm test`: passou, 5/5; inclui instalação nova vs. config legada, consentimento, comparação semântica e ciclo gerenciado Codex 1.2.0 → 1.3.0 → rollback 1.2.0. Versão staged inválida não substitui a instalação ativa.
- `npm run lint`: passou.
- `npm run smoke`: passou; runtime criou projetos/marcas, derivou conteúdo e cancelou PTY.
- `npm run build`: passou; Vite reporta chunk do renderer de 599,59 kB (>500 kB).
- Preview real da renderer + Runtime: onboarding exibido e concluído para a tela Projetos; Chromium em 1280/900, 768/900 e 390/844 sem overflow horizontal, sem botões sem nome e sem erros de console.
- Consulta de versões reais ocorreu ao abrir o Setup; nenhuma instalação/atualização real de CLI, login ou geração paga foi executada.
- `orquestrador-maestro check-dev-gates --project-path . --strict`: passou; alertou hotspots recorrentes já existentes em `package.json` (4 entradas) e `src/main/electron.ts` (3 entradas).

## Auditoria atual do worktree

- Cadeia executada: `npm run typecheck && npm run lint && npm test && npm run smoke && npm run dist:linux`; todos passaram. `npm test`: 5/5.
- O AppImage reconstruído (x86_64) abriu por FUSE sem `--no-sandbox`/`--appimage-extract-and-run`. Em perfil e workspace temporários, onboarding concluiu, projeto e marca foram criados pela UI, Setup abriu, consulta de versão estável Codex/Claude indicou estado current; nenhum erro do renderer.
- `release/linux-unpacked/maquina-de-conteudo` retornou para `app.updateCheck` a instrução de atualizar `.deb` pelo gerenciador do sistema; nenhum erro do renderer.
- Artefatos atuais: AppImage executável de 121.033.584 bytes e `.deb` amd64 de 92.216.380 bytes. `dpkg-deb --field` confirma pacote `maquina-de-conteudo`, versão `0.1.0`, arquitetura `amd64`.
- `npm run dist:windows` e `npm run dist:mac` localmente falham no rebuild de `node-pty` por cross-compilation; o GitHub Actions executou os três builds nativos com sucesso. Nenhum instalador Windows/macOS foi instalado ou testado manualmente; os artefatos do run não foram carregados por erro de nome.
- `orquestrador-maestro check-dev-gates --project-path . --strict`: passou; recorrência histórica em `package.json` e `src/main/electron.ts` avisada, não bloqueante.
- O processo normal encerrou com X connection error; o relançamento falhou enquanto X não estava acessível. Após Xwayland ficar alcançável (`xdpyinfo`), `npm start` voltou a iniciar com `ELECTRON_WINDOW_READY`; serviço `maquina-desktop-live` está pronto.
- Portabilidade do harness: `npm test` usa FFmpeg e symlink; `npm run smoke` depende de `../PostNow`, `../VideoGo` e do caminho fixo Linux de Maestro. O smoke só foi validado no layout Linux atual; testes nativos ainda dependem de tornar esses paths configuráveis/provisionados.
## Execução inicial de release

- Commit inicial `80cc1e5` publicado em `main`; tag anotada `v0.1.0` publicada.
- GitHub Actions run `42040288628`: validação da tag e builds `dist:linux`, `dist:windows`, `dist:mac` passaram; os três uploads falharam por nomes inválidos contendo `:` (`release-dist:linux`, etc.).
- O job `publish` não executou; a API pública não mostra release. Corrigido localmente para nomes `release-${{ runner.os }}` e adicionado `workflow_dispatch` para reconstruir a mesma tag sem retarget. Fix ainda precisa ser enviado antes do retry.

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

- Live GitHub release lookup/download/install was not exercised because no tag/release was published.
- GitHub Actions orchestration, native Windows/macOS installers, signing/notarization, and their update flows remain unverified on their native hosts.
- Paid model-generation requests and interactive authentication were not invoked; they require user authorization.

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

- Passed: typecheck, lint, `npm test` 5/5, smoke, build, onboarding no Chromium e ciclo gerenciado Codex install/update/rollback; DEV gates em modo strict passaram com alerta de recorrência não bloqueante.
- Earlier release evidence: Linux AppImage/deb, abertura AppImage, guarda de update `.deb` e fluxo de projeto em workspace descartável.
- Failed: Nenhum teste Linux da tarefa atual; tentativa Linux→Windows cross-build falhou ao reconstruir `node-pty` com `node-gyp`.
- Limits: Instalações reais de CLI e autenticação não foram executadas; Windows/macOS nativos, assinatura/notarização, GitHub Actions e update remoto seguem pendentes.
