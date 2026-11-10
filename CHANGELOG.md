# Changelog — Máquina de Conteúdo

Entradas agrupadas por data. Versões seguem SemVer. Releases são publicadas por tag (`v*.*.*`) pelo workflow `release.yml`.

## 2026-11-10

### Não lançado — login do Codex em Motores & Setup
- "Entrar na conta" do Codex não fazia nada: o diretório `codex-home` do app não era criado, e o Codex CLI saía com erro antes de pedir o código. O diretório agora é criado antes de qualquer execução do CLI.

### 0.2.2 — README e screenshots no repositório
- README compactado, com os três screenshots versionados em `docs/screenshots/`.
- Sem mudança de código do app em relação à 0.2.1; a release só traz a documentação atualizada.

### 0.2.1 — correção do submenu de Motores & Setup
- As abas "Motores & CLIs" e "ElevenLabs & Voz" não são mais cortadas em janelas estreitas; quebram para outra linha.
- Publicada pela tag `v0.2.1` (o runbook proíbe mover tag publicada).

### 0.2.0 — atualização automática do app
- O app baixa novas versões em segundo plano, instala ao fechar e mostra **Reiniciar e atualizar** quando estiver pronto.
- Verificação de atualização 15 s após abrir e depois a cada 6 h.
- Release por tag gera `.exe` (Windows), `.dmg` e `.zip` (macOS arm64), AppImage e `.deb` (Linux).
- Limites: macOS só atualiza com build assinado; `.deb` é atualizado manualmente.

## 2026-11-09

### Vídeo
- Modelo de vídeo fixo em Claude Opus 5.5, com acesso real ao VideoGo (leitura do motor, `project validate|sound|render|sheet`).
- Storyboard com título, foto da marca (`assetPath`) e composição 3D (`compositionId`).
- Composição autoral escrita pelo agente (Opus 5.5 medium), sincronizada às palavras da narração; render em 1080×1920 com `h264_nvenc`.

### Entrega e capas
- Capa salva antes da copy: se o Claude falhar, a capa paga do Codex não é descartada.
- Nova ação **Gerar só a copy (Claude)** e **Gerar só a capa (Codex)**.
- Capa com título exato, pessoa fiel às fotos reais, logo oficial aplicada por cima e conferência de até 3 tentativas.

### Fluxo do Studio
- "Avançar" aprova a etapa e abre a próxima; sumiram os "Aprovar" por cena.
- "Gerar áudio" aprova texto/voz junto e já confirma o envio ao ElevenLabs.
- Runs de Claude e Codex usam `CLAUDE_CONFIG_DIR` e `CODEX_HOME` isolados em `<dataDir>`; não leem `~/.claude` nem `~/.codex`.

### Setup e contas
- Submenu ElevenLabs no menu Motores & Setup, com banner de status e layout redesenhado.
- Contas logadas visíveis: GitHub, Codex e Claude (e-mail e plano), lidas pelas CLIs oficiais.

### Biblioteca de projetos
- Criação separada da biblioteca; quantidade filtrada; ausência de capa explícita.

## 2026-11-08

### Revisão geral
- Aprovações editoriais fail-closed, com reconciliação e `claims.json` validado.
- Referência de narração órfã é removível e não fica invisível.
- Contrato do VideoGo v1 aparece como aviso no Studio e recusa o render.
- Falha de comando mostra código e comando.
- Recorte da capa 1448×1086 sem corte.

## 2026-11-07

### Formatos
- Formato 4:5 removido. Projeto com formato removido abre com aviso, sem migração.
- Formato escolhido por rodada; regerar refaz a rodada com o formato escolhido.
- Rodada entregue não é sobrescrita por status ilegível.

### ElevenLabs
- Chave validada pelo status HTTP: 401 sem permissão recusa e não salva; 401/403 com `missing_permissions` salva com aviso; 429 e erro de rede têm mensagens próprias.

### Narração
- Narração por cena, com áudio próprio (upload de mp3 ou gravação) e remoção por cena.
- Modo Studio: teleprompter com gravação de áudio. Câmera continua negada.
- Render recusa cena sem áudio.

## 2026-11-05

### 0.1.0
- Inicialização do repositório e do pipeline de release.

### 0.1.1
- Upload de artefatos de release pode ser refeito sem erro.
- Manifests de atualização (`latest*.yml`) alinhados aos nomes dos artefatos.

### Depois da 0.1.1 (mesmo dia)
- Diagnóstico de motores e narração com ElevenLabs.
- Comparação de custo entre modelos de CLI.
- Configurações do ElevenLabs movidas para o setup de motores.
- Guia completo de setup e plataforma.
