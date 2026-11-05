# Context — Máquina de Conteúdo (Studio)

## State

- App Electron/React integra PostNow, VideoGo, Orquestrador Maestro, marcas, aprovação por hash, exportação e derivação imagem↔vídeo; inclui integração ElevenLabs documentada no README e spec ativa. A configuração de voz fica em Motores & Setup, junto ao VideoGo; Preferências mantém workspace, agente e atualização. Release pública v0.1.1 tem AppImage/deb Linux x86_64, NSIS Windows x64 e DMG/ZIP macOS arm64. Localmente, AppImage v0.1.1 abriu em workspace descartável e UI de projeto/narração/Setup passou; `.deb` metadata verificado sem apt install. Windows/macOS ainda não foram instalados nem testados nativamente.
- ElevenLabs: `safeStorage` encrypts the local key; Motores & Setup gerencia key, vozes e IVC; Studio saves editorial/spoken text per scene, hash-binds approval to text/voice/model, requires explicit confirmation before `eleven_v4` synthesis, and requires individual audio approval before render. The child-only key env and `VIDEOGO_NO_VOICE_CACHE=1` avoid settings/args/log/cache persistence.
- Verification: Studio typecheck/lint/7 tests/smoke/build and Chromium 390 px visual pass; VideoGo typecheck/49 core + 20 flicker/externalaudio E2E/build pass. No live paid TTS or clone; no native Windows/macOS runtime.

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

## Next Context

- Artefatos públicos v0.1.1: AppImage/deb Linux x86_64; instalador NSIS Windows x64; DMG/ZIP macOS arm64. O feed AppImage foi consultado pelo app e informou “versão atual”; atualização entre versões distintas não foi testada. Pacotes locais: `release/maquina-de-conteudo-0.1.1-x86_64.AppImage` (122.062.829 bytes) e `release/maquina-de-conteudo-0.1.1-amd64.deb` (92.381.148 bytes). AppImage aberto em perfil/workspace temporários; `.deb` não instalado com apt. Evidências: `DEV/VERIFY.md`.
