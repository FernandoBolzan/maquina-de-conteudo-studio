# Testing And Verification

## Local checks

```bash
npm run typecheck
npm run lint
npm test
npm run smoke
npm run build
npm start
```

## Distribution targets

```bash
npm run dist:linux    # AppImage + deb; build and launch on Linux
npm run dist:windows  # NSIS installer; certify install, PTY, and updater on Windows
npm run dist:mac      # dmg + zip; build, open, and verify permissions on macOS
```

The current verified Linux artifacts are:
- `release/maquina-de-conteudo-0.1.1-x86_64.AppImage` — 122,062,829 bytes; launched from FUSE in a disposable profile/workspace.
- `release/maquina-de-conteudo-0.1.1-amd64.deb` — 92,381,148 bytes; `dpkg-deb --field` reports package `maquina-de-conteudo`, version `0.1.1`, architecture `amd64`; not installed with apt.

The public `v0.1.1` release also provides a Windows x64 NSIS installer and macOS arm64 DMG/ZIP. Windows/macOS native installation and user flows remain unverified. The public updater manifests match the published artifact names; signatures/notarization were not validated. AppImage supports user-confirmed in-app updates; `.deb` updates through the system package manager.

## Automated suite and prerequisites

- `npm test` atualmente executa sete testes Node, incluindo proteção da chave ElevenLabs e bloqueio de TTS até aprovação explícita; não usa API key real nem faz chamada paga.
- Testes de runtime usam `ffmpeg` para criar fixture PNG e criam symlink. Instale FFmpeg no host; Windows também precisa permitir symlink (Developer Mode ou privilégios adequados).
- `npm run smoke` cria e remove uma raiz de dados/workspace temporária. Exercita criação de marca e projetos, derivação de imagem/vídeo com FFmpeg, manifesto de exportação, preflight de motores, entrada/redimensionamento/cancelamento de PTY e eventos.
- Os caminhos aceitam `MDC_SMOKE_POSTNOW`, `MDC_SMOKE_VIDEOGO` e `MDC_SMOKE_MAESTRO`. PostNow e VideoGo mantêm os defaults de diretórios irmãos; Maestro tem default Linux `/usr/local/lib/node_modules/@iapro/orquestrador-maestro-cli` apenas no Linux. Windows/macOS precisam de `MDC_SMOKE_MAESTRO`; smoke nativo ainda não foi executado.
- Latest command outcomes and artifact sizes: [`VERIFY.md`](VERIFY.md). User installation steps and the platform status matrix: [`../README.md`](../README.md).

## Release and update contract

- `package.json` SemVer is authoritative; stable tags must be annotated `vX.Y.Z` and match it exactly.
- Pushing a matching tag starts `.github/workflows/release.yml`. Three native builds must succeed before GitHub creates the stable release with installers and updater metadata.
- Packaged UI flow: check for update, review offered version, explicitly confirm download/install, then restart. The fixed feed is `FernandoBolzan/maquina-de-conteudo-studio`; no environment variable is required.
- Do not publish a release without electron-updater `latest*.yml` metadata. Do not overwrite published tags; recovery is a higher SemVer version.
- A release pública `v0.1.1` foi publicada após a Actions run `42045235690`; três builds nativos e uploads concluíram. Os manifests públicos correspondem aos nomes dos assets. Runtime/instalação Windows/macOS permanecem por validar nativamente; histórico de runs está em [`VERIFY.md`](VERIFY.md).
## Manual user-flow checks

- Launch the Electron window and inspect navigation, project creation, and brand creation in a disposable workspace.
- Render a carousel using a healthy PostNow environment; verify 1080x1350 output and slide previews.
- Approve slides, derive image -> VideoGo, render an MP4 with VideoGo, then extract frames back to an image project.
- Verify setup diagnostics, authentication status, preferences, and the unconfigured-update-channel message.
- Verify security cases in `tests/runtime.test.ts` and project/export/FFmpeg/PTy flows in `scripts/smoke.ts`.
- `tests/update-policy.test.ts` covers AppImage-only Linux in-app updates; the packaged non-AppImage Linux binary must show the package-manager message without querying the update feed.
- Do not invoke paid model generation or login flows in unattended tests.
