# Roadmap — Máquina de Conteúdo

## Fase 1: Arquitetura, Onboarding de Leigos & Especificação [Concluído]
- [x] Mapeamento dos 3 motores (VideoGo, PostNow, Orquestrador Maestro).
- [x] Concepção da camada de autoprovisionamento (The Doctor & Provisioner Engine).
- [x] Integração de agentes de IA: Claude Code CLI e Codex CLI no terminal embutido.
- [x] Definição do fluxo de autenticação e entitlement por GitHub OAuth Device Flow.
- [x] Especificação da arquitetura avançada de terminal inspirada no OMP (History/Viewport, Backpressure, killTree).
- [x] Concepção da UX híbrida (Universal AI Command Bar + Terminal + Visual Studio).
- [x] Especificação da ponte de conversão entre Imagem e Vídeo.

## Fase 2: Scaffold do App Desktop (Electron + React + xterm.js)
- [ ] Inicialização do repositório com Electron Forge / Vite + React + Tailwind.
- [ ] Implementação do módulo GitHub Device Flow e armazenamento seguro de token via keytar.
- [ ] Implementação do componente de terminal avançado com backpressure, bounded queue e renderização diferencial.
- [ ] Implementação do Doctor Engine (checagem de Git, FFmpeg, Python, Claude e Codex).

## Fase 3: Integração dos Motores e Gestor de Contêineres
- [ ] Camada de abstração `EngineDriver` (Docker Compose / Subprocess Runner local com `killTree`).
- [ ] Autenticação e instalação guiada de Claude Code (`claude login`) e Codex CLI.
- [ ] Integração do Orquestrador Maestro (`context brief` e economia de tokens).
- [ ] Verificador de entitlement (permissão de leitura nos repositórios privados).
- [ ] Mecanismo de download e auto-atualização dos repositórios/imagens.

## Fase 4: Visual Workspace & Ponte de Projetos
- [ ] Brand Vault (gestão de logos oficiais, paletas de cores e perfis de clientes).
- [ ] Universal AI Command Bar (input de prompt em linguagem natural para geração).
- [ ] Módulo Visual PostNow: visualizador de carrossel e contact-sheet QA interativo.
- [ ] Módulo Visual VideoGo: timeline de cenas do storyboard e player de vídeo MP4.
- [ ] Botão e pipeline de transformação automática: Post de Imagem -> Vídeo Motion.

## Fase 5: Empacotamento Cross-Platform & Releases
- [x] Linux x86_64: AppImage/deb gerados; AppImage aberto e UI exercitada.
- [ ] Windows: NSIS configurado; build e teste nativo pendentes.
- [ ] macOS: dmg/zip configurados; build e teste nativo pendentes.
- [ ] Pipeline CI/CD e auto-updater com canal de releases configurado.
