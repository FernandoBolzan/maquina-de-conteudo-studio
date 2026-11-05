# Context — Máquina de Conteúdo (Studio)

## State

- O app desktop Electron/React integra PostNow, VideoGo, Orquestrador Maestro, marcas, aprovação por hash, exportação e derivação de projetos imagem↔vídeo. Linux AppImage e `.deb` x86_64 foram reconstruídos e testados; onboarding e criação de projeto/marca passaram na UI do AppImage em workspace descartável. A validação de instaladores e runtime Windows/macOS permanece pendente.

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

- Windows e macOS exigem validação nativa de NSIS/DMG, PTY, diálogos, permissões e caminhos. Tentativas cruzadas atuais no Linux falharam ao recompilar `node-pty` com node-gyp; wine/PowerShell/xcrun indisponíveis. QEMU não tem `/dev/kvm` nem mídia/disco Windows; não há hosts SSH. Builds/run de macOS exigem host macOS.
- CLI logins são interativos e permanecem nos CLIs oficiais; geração paga de modelos requer autorização do usuário.
- Autoatualização usa a release estável mais recente de `FernandoBolzan/maquina-de-conteudo-studio`; `package.json` é fonte SemVer, tags anotadas `vX.Y.Z` disparam `.github/workflows/release.yml`. Linux AppImage atualiza pelo app; `.deb` pelo gerenciador do sistema. Consulte `DEV/RUNBOOKS/RELEASES.md`.
- Pacotes Linux são x86_64: AppImage e Debian. O builder usa o ícone Electron padrão enquanto não houver ícones de distribuição configurados.

## Next Context

Artefatos Linux em `release/Máquina de Conteúdo (Studio)-0.1.0.AppImage` e `release/maquina-de-conteudo_0.1.0_amd64.deb`. AppImage executável e testado em sessão gráfica; `npm start` está novamente aberto após recuperação de Xwayland. Consulte `DEV/VERIFY.md` e `DEV/HANDOFF.md` para evidências e limites.
