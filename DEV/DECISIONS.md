# Decisões Técnicas — Máquina de Conteúdo

## ADR-001: Autenticação via GitHub OAuth Device Flow
- **Contexto**: O app precisa rodar no desktop (Electron/Linux App) e verificar se o usuário tem acesso aos repositórios/containers de VideoGo e PostNow.
- **Decisão**: Utilizar o OAuth Device Flow (`https://github.com/login/device/code`), igual ao GitHub CLI (`gh`).
- **Motivo**: Não requer armazenamento de client secret no binário do app nem inicialização de servidor web local de callback sujeito a bloqueios de firewall.

## ADR-002: Arquitetura de Interface Híbrida (Terminal + Visual Studio)
- **Contexto**: O usuário quer ver as imagens, gerenciar pastas e aprovar carrosséis visualmente, mas também precisa de uma pegada terminal/hacker para rodar e inspecionar tarefas pesadas de IA, FFmpeg e CLI.
- **Decisão**: Adotar layout split com Visual Workspace central (carrossel swipe, QA contact sheet, player MP4) e Console Terminal integrado com `xterm.js` no drawer inferior.
- **Motivo**: Combina velocidade e visibilidade de engenharia com fluidez de revisão de mídia.

## ADR-003: Ponte de Conteúdo Interoperável (Image <-> Video Bridge)
- **Contexto**: O usuário precisa reaproveitar projetos de imagem para gerar vídeos e vice-versa.
- **Decisão**: O app atua como compilador de dados entre os esquemas do PostNow (`project.json`, `claims.json`, `storyboard.md`) e do VideoGo (`storyboard.json`, assets, timing de cenas).
- **Motivo**: Elimina trabalho duplicado de redação de claims e copy, potencializando a produtividade de criação multiformato.

## ADR-004: Doctor Engine & Zero-Setup Provisioning para Leigos
- **Contexto**: Usuários não-técnicos não sabem compilar código, configurar variáveis de ambiente PATH, instalar FFmpeg ou resolver dependências do Python e Node.
- **Decisão**: O aplicativo embarca um subsistema de autoprovisionamento (Doctor Engine) que detecta, instala (via npm/winget/MinGit ou binários standalone em `~/.maquinadeconteudo/bin`) e valida todas as ferramentas no primeiro boot.
- **Motivo**: Remove 100% da barreira de entrada técnica, permitindo que qualquer leigo use a ferramenta em minutos.

## ADR-005: Agentes de IA (Claude Code & Codex) como Motores de Execução
- **Contexto**: O usuário leigo não conhece comandos de CLI como `postnow project check` ou `videogo project render`.
- **Decisão**: O aplicativo traduz pedidos em linguagem natural em chamadas direcionadas aos agentes de IA (Claude Code CLI e Codex CLI), guiados pelas regras e otimizações de token do Orquestrador Maestro.
- **Motivo**: O leigo ganha uma agência inteira de produção de conteúdo operando via chat/prompt, enquanto devs continuam com acesso livre ao terminal integrado.

## ADR-006: Arquitetura Avançada de Terminal Baseada no OMP
- **Contexto**: Terminais comuns travam ao receber fluxos volumosos de vídeo/IA (FFmpeg, Whisper), poluem o scrollback com milhares de linhas de progresso e deixam processos zumbis ao cancelar tarefas.
- **Decisão**: Adotar os padrões arquiteturais do OMP: separação entre histórico imutável e viewport volátil diferencial, fila com backpressure de 64 chunks no PTY, cancelamento atômico children-first (`killTree`), cards semânticos colapsáveis e canal JSONL RPC estruturado.
- **Motivo**: Garante performance fluida de 60fps na UI do Electron, scrollback legível para leigos e zero consumo indevido de CPU por processos órfãos.
