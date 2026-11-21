// Cabeçalho HTML até <style>.
export const MARKUP_HEAD = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#09090b">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Máquina Mobile">
  <title>Máquina de Conteúdo — Acesso Mobile</title>
  <style>
`;

export const MARKUP_BODY = `  </style>
</head>
<body>
  <!-- Top Bar -->
  <header class="top-bar">
    <div class="brand">
      <div class="brand-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
      <div>
        <div class="brand-title">Máquina Mobile</div>
      </div>
    </div>
    <div class="top-actions">
      <button id="topCreateBtn" class="btn-create-top" style="display: none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Criar</span>
      </button>
      <div id="livePill" class="live-pill">
        <span id="liveDot" class="live-dot"></span>
        <span id="liveText">Desconectado</span>
      </div>
    </div>
  </header>
  <div id="offlineBanner" class="offline-banner" role="status" aria-live="polite"></div>
  <div id="toastHost" class="toast-host" role="status" aria-live="polite"></div>

  <!-- Main View Area -->
  <main id="appMain" class="app-main">
    <!-- View 1: Auth Screen -->
    <div id="authView" class="auth-view" style="display: none;">
      <div class="auth-card">
        <div class="auth-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h1>Acesso Remoto</h1>
        <p>Digite o token alfanumérico de 6 dígitos exibido no Studio ou terminal do computador para parear seu celular.</p>

        <form id="authForm">
          <div class="pin-grid">
            <input type="text" class="pin-box" maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" autocorrect="off" spellcheck="false" aria-label="Caractere 1 do código" autofocus data-idx="0">
            <input type="text" class="pin-box" maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" autocorrect="off" spellcheck="false" aria-label="Caractere 2 do código" data-idx="1">
            <input type="text" class="pin-box" maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" autocorrect="off" spellcheck="false" aria-label="Caractere 3 do código" data-idx="2">
            <input type="text" class="pin-box" maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" autocorrect="off" spellcheck="false" aria-label="Caractere 4 do código" data-idx="3">
            <input type="text" class="pin-box" maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" autocorrect="off" spellcheck="false" aria-label="Caractere 5 do código" data-idx="4">
            <input type="text" class="pin-box" maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" autocorrect="off" spellcheck="false" aria-label="Caractere 6 do código" data-idx="5">
          </div>
          <button type="submit" id="authSubmitBtn" class="btn-primary">
            <span>Conectar e Acessar</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </form>
        <div id="authError" class="auth-error" style="display: none;"></div>
      </div>
    </div>

    <!-- View 2: Live Monitor -->
    <div id="liveView" style="display: none;">
      <div id="interactionContainer"></div>

      <div class="section-title">
        <span>Tarefas em Andamento</span>
        <span id="activeJobsCount" class="tag">0 ativas</span>
      </div>
      <div id="runningJobsList"></div>

      <div class="section-title" style="margin-top: 20px;">
        <span>Terminal ao Vivo</span>
        <div class="terminal-controls">
          <label><input type="checkbox" id="autoScrollCheck" checked> Auto-scroll</label>
        </div>
      </div>
      <div id="terminalStream" class="terminal-container">Aguardando saída dos processos...</div>

      <div class="section-title" style="margin-top: 24px;">
        <span>Histórico Recente</span>
        <button id="refreshJobsBtn" class="btn-sm btn-secondary" style="padding: 2px 8px; font-size: 11px;">Atualizar</button>
      </div>
      <div id="recentJobsList"></div>
    </div>

    <!-- View 3: Projects & Files -->
    <div id="projectsView" style="display: none;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div class="filter-pills" style="margin-bottom: 0;">
          <button class="filter-pill active" data-filter="all">Todos</button>
          <button class="filter-pill" data-filter="image">Carrosséis</button>
          <button class="filter-pill" data-filter="video">Vídeos</button>
        </div>
        <button id="openCreateBtn" class="btn-sm btn-accent" style="white-space: nowrap;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Novo</span>
        </button>
      </div>
      <div id="projectsList" class="projects-list"></div>
    </div>

    <!-- View 4: Project Detail & Workflows (Studio Journey) -->
    <div id="projectDetailView" class="detail-view" style="display: none;">
      <button id="backToProjectsBtn" class="back-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        <span>Voltar para Projetos</span>
      </button>

      <div class="detail-header">
        <h2 id="detailTitle">Título do Projeto</h2>
        <div id="detailBadges" class="project-badges"></div>
      </div>
      <button id="staleBanner" type="button" class="stale-banner" data-act="refresh-stale" style="display: none;">Atualizado no computador — toque para recarregar</button>

      <!-- Step Indicator Bar -->
      <div class="step-bar-container">
        <div id="detailStepBar" class="step-bar"></div>
      </div>

      <!-- Active Step Shell -->
      <div id="detailStepShell" class="step-shell"></div>

      <!-- Quick AI instruction box -->
      <div class="workflow-actions-card">
        <div class="workflow-actions-title">Instrução Rápida com IA</div>
        <div class="agent-prompt-box" style="margin-top: 0; padding-top: 0; border-top: none;">
          <textarea id="agentPromptText" class="agent-prompt-input" placeholder="Instrução direta para a IA (ex: 'mude a headline do slide 2', 'reescreva o gancho')..."></textarea>
          <button id="sendAgentPromptBtn" class="btn-sm btn-accent" style="width: 100%;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>Enviar Instrução ao Agente</span>
          </button>
        </div>
      </div>

      <div class="section-title">
        <span>Arquivos do Projeto</span>
        <span id="detailAssetCount" class="tag">0 arquivos</span>
      </div>
      <div id="detailAssetsGrid" class="assets-grid"></div>
    </div>

    <!-- View 5: Connection & Tunnel Info -->
    <div id="connView" style="display: none;">
      <div class="section-title">Status da Conexão</div>
      <div class="card">
        <div class="info-row">
          <span class="info-label">Túnel Remoto</span>
          <span id="connTunnelStatus" class="info-value">Carregando...</span>
        </div>
        <div class="info-row">
          <span class="info-label">URL Pública</span>
          <span id="connUrl" class="info-value" style="font-size: 11px;">-</span>
        </div>
        <div class="info-row">
          <span class="info-label">Pasta Workspace</span>
          <span id="connWorkspace" class="info-value" style="font-size: 11px;">-</span>
        </div>
        <div class="info-row">
          <span class="info-label">Versão</span>
          <span id="connVersion" class="info-value">-</span>
        </div>
      </div>

      <div class="section-title" style="margin-top: 20px;">QR Code de Acesso</div>
      <div class="card" style="text-align: center;">
        <p style="font-size: 13px; color: var(--muted); margin-bottom: 12px;">Escaneie com outro dispositivo para acessar este mesmo painel:</p>
        <div id="qrContainer" class="qr-container" role="img" aria-label="QR Code de acesso">Carregando QR Code...</div>
      </div>

      <button id="logoutBtn" class="btn-primary" style="margin-top: 20px; background: #27272a;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>Desconectar deste Celular</span>
      </button>
    </div>
  </main>

  <!-- Create Project Modal -->
  <div id="createProjectModal" class="modal-overlay" style="display: none;">
    <div class="modal-sheet">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 18px; font-weight: 700;">Criar Novo Conteúdo</h2>
        <button id="closeCreateModalBtn" style="color: var(--muted); padding: 4px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <form id="createProjectForm">
        <!-- Tipo de Conteúdo -->
        <div class="create-type-grid">
          <div id="typeImageBtn" class="create-type-btn selected" role="button" tabindex="0" data-act="create-kind" data-kind="image">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <strong style="font-size: 13px;">Carrossel / Post</strong>
            <span style="font-size: 11px; color: var(--muted);">PostNow + Codex</span>
          </div>
          <div id="typeVideoBtn" class="create-type-btn" role="button" tabindex="0" data-act="create-kind" data-kind="video">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            <strong style="font-size: 13px;">Vídeo Curto</strong>
            <span style="font-size: 11px; color: var(--muted);">VideoGo + Claude</span>
          </div>
        </div>

        <!-- Formato -->
        <div class="form-group">
          <label>Formato do Conteúdo</label>
          <select id="createFormat" class="form-control"></select>
        </div>
        <div class="form-group">
          <label for="createBrand">Marca</label>
          <select id="createBrand" class="form-control">
            <option value="">Sem marca</option>
          </select>
          <small id="createBrandHint" style="display: none; color: var(--warning);">Para gerar imagens é preciso escolher uma marca com logo. Sem marca, você só prepara a pauta e os textos.</small>
        </div>
        <div class="form-group">
          <label for="createUseBrandImages">Fotos e referências da marca</label>
          <select id="createUseBrandImages" class="form-control">
            <option value="no">Não usar fotos</option>
            <option value="yes">Usar quando pertinentes</option>
          </select>
          <small>Esta escolha fica salva no projeto e vale para imagens e vídeos.</small>
        </div>

        <!-- Páginas (se carrossel) -->
        <div id="pageCountGroup" class="form-group">
          <label>Quantidade de Slides (Carrossel)</label>
          <select id="createPages" class="form-control">
            <option value="5">5 slides (Recomendado)</option>
            <option value="3">3 slides (Mínimo)</option>
            <option value="4">4 slides</option>
            <option value="6">6 slides</option>
            <option value="7">7 slides</option>
            <option value="8">8 slides</option>
            <option value="9">9 slides</option>
            <option value="10">10 slides (Completo)</option>
          </select>
        </div>

        <!-- Modelo / Template de Conteúdo -->
        <div class="form-group">
          <label>Modelo de Conteúdo (Biblioteca de Prompts)</label>
          <select id="createRecipe" class="form-control">
            <option value="custom">✏️ Personalizado (Livre)</option>
          </select>
        </div>
        <!-- Tema / Assunto -->
        <div class="form-group">
          <label>Tema / Assunto Principal</label>
          <textarea id="createTopic" class="form-control" rows="2" placeholder="Ex: 5 erros comuns ao tentar emagrecer e como evitar..." required></textarea>
        </div>

        <!-- Título -->
        <div class="form-group">
          <label>Título do Projeto</label>
          <input type="text" id="createTitle" class="form-control" placeholder="Ex: Carrossel - 5 Erros no Emagrecimento">
        </div>

        <!-- Público & Tom -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label>Público-alvo</label>
            <input type="text" id="createAudience" class="form-control" value="Público geral">
          </div>
          <div class="form-group">
            <label>Tom de Voz</label>
            <input type="text" id="createTone" class="form-control" value="Direto e prático">
          </div>
        </div>

        <!-- CTA -->
        <div class="form-group">
          <label>Chamada para Ação (CTA)</label>
          <input type="text" id="createCta" class="form-control" value="Salve e compartilhe este post">
        </div>

        <!-- Checkbox Auto-start -->
        <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin: 14px 0;">
          <input type="checkbox" id="createAutoStart" checked style="width: 22px; height: 22px; accent-color: var(--accent);">
          <label for="createAutoStart" style="margin-bottom: 0; font-size: 13px; color: var(--fg); cursor: pointer;">
            Iniciar agente de IA após criar (pede confirmação; consome créditos)
          </label>
        </div>

        <button type="submit" id="submitCreateBtn" class="btn-primary" style="margin-top: 10px;">
          <span>🚀 Criar e Iniciar Produção</span>
        </button>
      </form>
    </div>
  </div>

  <!-- Lightbox Modal -->
  <div id="lightboxModal" class="modal-overlay" style="display: none;">
    <div class="modal-bar">
      <span id="lightboxTitle" style="font-size: 13px; font-weight: 600;">Visualização</span>
      <div style="display: flex; gap: 12px; align-items: center;">
        <a id="lightboxDownloadBtn" download class="btn-sm btn-accent" style="padding: 4px 10px; font-size: 12px; text-decoration: none;">Download</a>
        <button id="lightboxCloseBtn" style="color: #fff; padding: 4px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div id="lightboxContent" class="modal-content"></div>
  </div>

  <!-- Bottom Navigation -->
  <nav id="bottomNav" class="bottom-nav" style="display: none;">
    <button class="nav-item active" data-tab="live">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
      <span>Ao Vivo</span>
    </button>
    <button class="nav-item" data-tab="projects">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <span>Projetos & Arquivos</span>
    </button>
    <button class="nav-item" data-tab="conn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
      <span>Conexão</span>
    </button>
  </nav>

  <!-- Client Script -->
  <script>
`;
