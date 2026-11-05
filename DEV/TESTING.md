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
- `release/Máquina de Conteúdo (Studio)-0.1.0.AppImage`
- `release/maquina-de-conteudo_0.1.0_amd64.deb`

The AppImage is executable and launches directly; the deb metadata can be checked with `dpkg-deb --info`.

Windows and macOS packages require native-host build and runtime checks. A Linux build is not evidence that native installers, PTY, filesystem dialogs, authentication, or signing work on those systems. The GitHub-tag release workflow is defined in `DEV/RUNBOOKS/RELEASES.md`; it does not sign/notarize binaries. AppImage supports automatic updates on Linux, while `.deb` updates through the system package manager.

## Release and update contract

- `package.json` SemVer is authoritative; stable tags must be annotated `vX.Y.Z` and match it exactly.
- Pushing a matching tag starts `.github/workflows/release.yml`. Three native builds must succeed before GitHub creates the stable release with installers and updater metadata.
- Packaged UI flow: check for update, review offered version, explicitly confirm download/install, then restart. The fixed feed is `FernandoBolzan/maquina-de-conteudo-studio`; no environment variable is required.
- Do not publish a release without electron-updater `latest*.yml` metadata. Do not overwrite published tags; recovery is a higher SemVer version.
- No release has been published or tag pushed by local validation.
## User-flow smoke

- Launch the Electron window and inspect navigation, project creation, and brand creation in a disposable workspace.
- Render a carousel using a healthy PostNow environment; verify 1080x1350 output and slide previews.
- Approve slides, derive image -> VideoGo, render an MP4 with VideoGo, then extract frames back to an image project.
- Verify setup diagnostics, authentication status, preferences, and the unconfigured-update-channel message.
- Verify security cases in `tests/runtime.test.ts` and project/export/FFmpeg/PTy flows in `scripts/smoke.ts`.
- `tests/update-policy.test.ts` covers AppImage-only Linux in-app updates; the packaged non-AppImage Linux binary must show the package-manager message without querying the update feed.
- Do not invoke paid model generation or login flows in unattended tests.
