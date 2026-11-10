# Roadmap — Máquina de Conteúdo (Studio)

Status do ciclo de desenvolvimento do aplicativo desktop Máquina de Conteúdo (Studio).  
Estrutura organizada por prioridade: **Pendências & Backlog no topo**, seguidas pelas **Entregas Concluídas**.

---

## 📌 A Fazer / Pendente (Backlog & Próximos Passos)

### 1. Validação Nativa Multiplataforma (Windows & macOS)
- [ ] **Windows Nativo (NSIS)**: Instalar pacote gerado em ambiente Windows x64 real; validar inicialização, PTY (`node-pty`), diálogos nativos (`app.pick`), caminhos com contra-barra e permissões.
- [ ] **macOS Nativo (DMG/ZIP)**: Abrir pacote em ambiente macOS arm64/Intel; validar permissão de microfone para gravação de narração no Modo Studio, subprocessos e abertura de diretórios.
- [ ] **Assinatura & Notarização**: Configurar certificados Authenticode (Windows) e credenciais Apple Developer (macOS Notarization) no pipeline de distribuição.

### 2. Geração Paga & Execução em Nuvem Autorizada
- [ ] **Síntese de Voz ElevenLabs Real**: Exercitar chamada real de geração de áudio (modelo Eleven v4) em projeto descartável quando houver autorização expressa de consumo de créditos da conta.
- [ ] **Geração de Imagens Codex Real**: Validar geração completa de carrossel de 10 páginas com chamadas pagas da API ImageGen sob nova autorização do usuário.

### 3. Governança, Contratos & Refinamentos
- [ ] **Validação Pós-Job do Storyboard**: Implementar verificação automática pós-execução do storyboard VideoGo (AC13 iii do active spec).
- [ ] **Releitura Pré-Patch**: Releitura obrigatória do arquivo antes da aplicação de patches estruturais (`apply_patch`, AC13 ii).
- [ ] **Sanitização de Resíduo Root**: Remover o resíduo root-owned em `~/.codex/tmp/arg0-linux` (ADR-026; requer privilégios de superusuário no host).
- [ ] **Tratamento de Hotspots de Recorrência**: Conduzir investigação causal nos arquivos com histórico de múltiplas alterações (`src/main/projects.ts`, `src/main/agents.ts`, `Studio.tsx`).

### 4. Ciclo de Publicação (Release 0.2.0)
- [ ] **Decisão Editorial das Pendências 9–13**: Colher decisão da usuária sobre as pendências 9 a 13 registradas em `DEV/DECISIONS.md`.
- [ ] **Homologação da Release 0.2.0**: Com os testes nativos aprovados, criar tag anotada `v0.2.0` e acionar o workflow de publicação multiplataforma via GitHub Releases.

---

## ✅ Concluído / O Que Foi Feito

### Fase 1: Arquitetura, Contratos & Especificação
- [x] Mapeamento e especificação dos 3 motores (PostNow para carrosséis, VideoGo para vídeos verticais, Orquestrador Maestro para contexto de IA).
- [x] Definição da arquitetura desktop isolada no Electron com protocolo seguro `media://asset/<token>`, sandbox e CSP estrito.
- [x] Especificação da governança de aprovação vinculada a hash SHA-256 e manifesto de exportação `MANIFEST.json`.
- [x] Especificação do contrato bidirecional de conversão Imagem ↔ Vídeo sem disparos automáticos de render.

### Fase 2: Shell Desktop, Terminal Interativo & Provisionamento Técnico
- [x] Scaffold completo da aplicação desktop: Electron + Vite + React + TypeScript com design system de tokens próprio (sem dependência de Tailwind).
- [x] Terminal PTY avançado com `node-pty` e `@xterm/xterm`, suporte a redação de senhas/segredos, interatividade de prompts de autenticação e histórico limitado em memória.
- [x] The Doctor & Provisionamento: diagnóstico em tempo real de Node.js, Python, FFmpeg, FFprobe, Git e cloudflared com orientação para instalação.
- [x] Gestão de CLIs oficiais de IA: suporte integrado a OpenAI Codex e Claude Code com detecção de versão, instalação isolada, atualização segura e rollback.
- [x] Armazenamento seguro de segredos no cofre nativo do SO (`safeStorage` do Electron / chaveiro do sistema).

### Fase 3: Integração dos Motores, Agentes e Supervisor Local
- [x] Supervisor de subprocessos locais com controle transacional e encerramento seguro por árvore (`killTree`).
- [x] Conexão oficial ao GitHub via CLI (`gh`) com autenticação Device Flow sem expor senhas.
- [x] Orquestrador Maestro integrado para montagem de contexto (`context brief`), economia de tokens e smoke tests locais.
- [x] Verificador de entitlements e detecção de permissões para motores privados.
- [x] Módulos de download, vinculação de pasta local, atualização e rollback dos motores PostNow e VideoGo.

### Fase 4: Visual Workspace, Mesa Editorial, Narração & Setup
- [x] **Brand Vault**: Cadastro e gestão de marcas locais, paletas de cores, referências visuais (PNG, JPG, WebP) e retratos aprovados de clientes.
- [x] **Composer & Biblioteca de Prompts**: Universal AI Command Bar, receitas de carrossel com injeção automática de contagem de páginas e prompts pessoais salvos localmente.
- [x] **Módulo Visual PostNow**:
  - [x] Pastas legíveis derivadas do título do projeto com UUID interno estável.
  - [x] Editor visual de textos na tela (headline, copy, quem aparece) desacoplado dos prompts técnicos.
  - [x] Gate de aprovação editorial tripartite (headline, copy e fontes em `research/claims.json`) atrelado a SHA-256.
  - [x] Conformação centralizada de imagem de até 3% por lado (ADR-018) evitando deformações.
  - [x] Aplicação de logo oficial em PNG de alta resolução via overlay FFmpeg conforme política de logo da rodada.
  - [x] Revisão imagem a imagem (Manter / Refazer) gerando rodadas incrementais.
  - [x] Exclusão física recuperável de imagens com journal transacional.
  - [x] Exportação de pasta e arquivo ZIP STORE íntegro com manifesto.
- [x] **Módulo Visual VideoGo**:
  - [x] Storyboard validado contra o contrato `videogo.storyboard/v1` com avisos na interface.
  - [x] Editor de cenas, visualização de roteiro e teleprompter.
  - [x] Narração por cena com suporte a gravação de áudio no Modo Studio (offline) e upload próprio de arquivos WAV/MP3/M4A/FLAC/OGG sem gastar créditos de IA.
  - [x] Gate de áudio estrito: síntese e render bloqueados até aprovação humana individual de cada cena.
  - [x] Renderização final em MP4 com aceleração por hardware (`h264_nvenc`) e mixagem de voz, trilha e efeitos sonoros.
- [x] **Ponte Bidirecional Imagem ↔ Vídeo**:
  - [x] Imagem → Vídeo: derivação manual de carrossel PostNow para storyboard VideoGo.
  - [x] Vídeo → Imagem: extração de quadros nítidos via FFmpeg para nova entrada de post/carrossel.
- [x] **Motores & Setup (Submenu ElevenLabs & Redesign do Layout)**:
  - [x] Submenu desacoplado e dedicado na sidebar e em tabs in-page (`Motores & CLIs` e `ElevenLabs & Voz`).
  - [x] Executive Overview Banner com métricas operacionais em tempo real (CLIs, Motores, Sistema, Voz).
  - [x] Painel de voz com 4 pilares de governança (`safeStorage`, zero-vazamento, gate editorial, áudio local).
  - [x] Campo de API key protegido com toggle de visibilidade (`Eye` / `EyeOff`) e orientações de permissões.
  - [x] Catálogo de vozes pesquisável com filtro por categoria (Todas, Clones, Catálogo) e player de preview sob demanda interativo.
  - [x] Estúdio de Instant Voice Cloning guiado em passos com termo legal de consentimento e validação via FFprobe.
- [x] **Acesso Mobile Remoto**:
  - [x] Integração com Cloudflare Tunnel (`cloudflared`) sem necessidade de abrir portas no roteador.
  - [x] Modal com QR Code dinâmico e PIN alfanumérico de 6 dígitos com limitação de tentativas.
  - [x] Servidor HTTP local servindo SPA responsiva e streaming de mídia com suporte a HTTP Range.

### Fase 5: Empacotamento Cross-Platform & CI/CD
- [x] Linux x86_64: Pacotes AppImage e .deb gerados e testados em ambiente Linux real com auto-updater no formato AppImage.
- [x] Configuração de empacotamento Windows (NSIS) e macOS (DMG/ZIP) no `package.json` via electron-builder.
- [x] Pipeline de CI/CD automatizado em `.github/workflows/release.yml` para compilação multiplataforma nas tags `vX.Y.Z`.
- [x] Release pública estável `v0.1.1` publicada e distribuída com canais de metadados `latest*.yml`.
