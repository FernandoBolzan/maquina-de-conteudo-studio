// Abertura do IIFE: estado, elementos, PIN, api(), esc(), ações delegadas, toast, confirmCost, refreshActive, onMediaError.
export const SCRIPT_CORE = `  (() => {
    // State
    const SESSION_KEY = 'mdc_mobile_session';
    let session = localStorage.getItem(SESSION_KEY) || '';
    let currentTab = 'live';
    let currentFilter = 'all';
    let projectsData = [];
    let projectsLoaded = false;
    let jobsData = [];
    let activeProject = null;
    let eventSource = null;
    let selectedCreateKind = 'image';
    let activeStepIndex = 0;
    let revisionDrafts = {};
    let promptRecipes = [];
    // Elements
    const liveDot = document.getElementById('liveDot');
    const liveText = document.getElementById('liveText');
    const authView = document.getElementById('authView');
    const liveView = document.getElementById('liveView');
    const projectsView = document.getElementById('projectsView');
    const projectDetailView = document.getElementById('projectDetailView');
    const connView = document.getElementById('connView');
    const bottomNav = document.getElementById('bottomNav');
    const topCreateBtn = document.getElementById('topCreateBtn');
    const openCreateBtn = document.getElementById('openCreateBtn');
    const createProjectModal = document.getElementById('createProjectModal');
    const closeCreateModalBtn = document.getElementById('closeCreateModalBtn');
    const createProjectForm = document.getElementById('createProjectForm');
    const authForm = document.getElementById('authForm');
    const authError = document.getElementById('authError');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const pinBoxes = document.querySelectorAll('.pin-box');
    const runningJobsList = document.getElementById('runningJobsList');
    const recentJobsList = document.getElementById('recentJobsList');
    const refreshJobsBtn = document.getElementById('refreshJobsBtn');
    const terminalStream = document.getElementById('terminalStream');
    const autoScrollCheck = document.getElementById('autoScrollCheck');
    const activeJobsCount = document.getElementById('activeJobsCount');
    const interactionContainer = document.getElementById('interactionContainer');
    const projectsList = document.getElementById('projectsList');
    const lightboxModal = document.getElementById('lightboxModal');
    const lightboxContent = document.getElementById('lightboxContent');
    const lightboxTitle = document.getElementById('lightboxTitle');
    const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');
    const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');
    const offlineBanner = document.getElementById('offlineBanner');
    const toastHost = document.getElementById('toastHost');
    const staleBanner = document.getElementById('staleBanner');

    // ---- Texto seguro -------------------------------------------------------
    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\`': '&#96;' };
    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"'\`]/g, (c) => ESC_MAP[c]);
    }
    // Alias mantido enquanto as etapas de imagem/vídeo migram para esc().
    const escapeHtml = esc;

    function prefersReducedMotion() {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    function scrollToY(top) {
      window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }

    // ---- API ----------------------------------------------------------------
    const EXPIRED_MSG = 'Sessão expirada. Informe o token novamente.';
    const PERMANENT_MSG = 'Este link não existe mais ou a sessão acabou. Se o app foi reiniciado no computador, escaneie o QR novo.';
    const OFFLINE_MSG = 'Sem conexão com o computador. Tentando reconectar…';
    let htmlFailures = 0;
    let linkDead = false;
    let offlineState = false;
    let recoveryTimer = null;

    class ApiError extends Error {
      constructor(kind, status, message) {
        super(message);
        this.name = 'ApiError';
        this.kind = kind;
        this.status = status;
      }
    }

    function clearSession() {
      localStorage.removeItem(SESSION_KEY);
      session = '';
    }

    function setOfflineBanner(on) {
      offlineBanner.textContent = on ? OFFLINE_MSG : '';
      offlineBanner.classList.toggle('visible', on);
    }

    function noteOffline() {
      if (offlineState) return;
      offlineState = true;
      setOfflineBanner(true);
      if (!recoveryTimer) recoveryTimer = setInterval(probeConnection, 5000);
    }

    function stopRecovery() {
      if (recoveryTimer) { clearInterval(recoveryTimer); recoveryTimer = null; }
    }

    function noteOnline() {
      if (!offlineState) return;
      offlineState = false;
      setOfflineBanner(false);
      stopRecovery();
      onReconnected();
    }

    async function probeConnection() {
      if (document.visibilityState === 'hidden') return;
      try { await api(session ? '/api/rev' : '/api/status'); } catch {}
    }

    function handleAuthFailure(message) {
      if (!session) return;
      clearSession();
      showAuthView(message);
    }

    function handlePermanentFailure() {
      linkDead = true;
      offlineState = false;
      setOfflineBanner(false);
      stopRecovery();
      clearSession();
      showAuthView(PERMANENT_MSG);
    }

    // api(path, { method, body, as, auth }) -> JSON | texto (as:'text'); lança ApiError { kind: 'auth'|'offline'|'server', status, message }.
    // auth:false desliga o tratamento global de 401 (PIN, checkSession, logout).
    async function api(path, opts) {
      const o = opts || {};
      const sent = session;
      const headers = {};
      if (sent) headers['Authorization'] = 'Bearer ' + sent;
      let body;
      if (o.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(o.body);
      }
      let res;
      let text;
      try {
        res = await fetch(path, { method: o.method || (body !== undefined ? 'POST' : 'GET'), headers, body, cache: 'no-store' });
        text = await res.text();
      } catch {
        noteOffline();
        throw new ApiError('offline', 0, OFFLINE_MSG);
      }
      if (o.as === 'text' && res.ok) {
        htmlFailures = 0;
        noteOnline();
        return text;
      }
      let data = null;
      let isJson = false;
      if (text) {
        try { data = JSON.parse(text); isJson = true; } catch {}
      } else if (res.ok) {
        isJson = true;
      }
      if (!isJson) {
        // Corpo que não é JSON: página de erro do Cloudflare (5xx/404/530/1033) ou proxy.
        htmlFailures++;
        const gone = res.status === 404 || res.status === 530 || res.status === 1033;
        noteOffline();
        if (gone && htmlFailures >= 2) {
          handlePermanentFailure();
          throw new ApiError('offline', res.status, PERMANENT_MSG);
        }
        throw new ApiError('offline', res.status, OFFLINE_MSG);
      }
      htmlFailures = 0;
      linkDead = false;
      noteOnline();
      if (res.status === 401) {
        const err = new ApiError('auth', 401, (data && data.error) || EXPIRED_MSG);
        if (o.auth !== false && sent && sent === session) handleAuthFailure(EXPIRED_MSG);
        throw err;
      }
      if (!res.ok) {
        throw new ApiError('server', res.status, (data && data.error) || ('Erro no servidor (HTTP ' + res.status + ').'));
      }
      return data;
    }

    // Mostra o erro de uma ação ao usuário (auth e permanente já têm tela própria).
    function reportError(err, fallback) {
      if (err && err.kind === 'auth') return;
      if (err && err.kind === 'offline') {
        if (!linkDead) toast('Sem conexão com o computador. Tente de novo em instantes.', 'error');
        return;
      }
      toast((err && err.message) || fallback || 'Não foi possível concluir a ação.', 'error');
    }

    // ---- Toast e confirmação --------------------------------------------------
    function toast(message, kind) {
      const el = document.createElement('div');
      el.className = 'toast' + (kind === 'error' ? ' error' : '');
      el.textContent = String(message);
      toastHost.appendChild(el);
      while (toastHost.children.length > 3) toastHost.removeChild(toastHost.firstChild);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, kind === 'error' ? 6000 : 3500);
    }

    let closeConfirm = null;
    // confirmCost(mensagem, { title, okLabel, cancelLabel }) -> Promise<boolean>. Folha na página; nada de window.confirm.
    function confirmCost(message, opts) {
      const o = opts || {};
      if (closeConfirm) closeConfirm(false);
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        const sheet = document.createElement('div');
        sheet.className = 'confirm-sheet';
        sheet.setAttribute('role', 'alertdialog');
        sheet.setAttribute('aria-modal', 'true');
        const title = document.createElement('div');
        title.className = 'confirm-title';
        title.textContent = o.title || 'Confirmar ação';
        const text = document.createElement('div');
        text.className = 'confirm-text';
        text.textContent = String(message);
        const actions = document.createElement('div');
        actions.className = 'confirm-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'confirm-cancel';
        cancel.textContent = o.cancelLabel || 'Cancelar';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'confirm-ok';
        ok.textContent = o.okLabel || 'Continuar';
        actions.appendChild(cancel);
        actions.appendChild(ok);
        sheet.appendChild(title);
        sheet.appendChild(text);
        sheet.appendChild(actions);
        overlay.appendChild(sheet);
        const previousFocus = document.activeElement;
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          document.removeEventListener('keydown', onKey, true);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (closeConfirm === finish) closeConfirm = null;
          if (previousFocus && previousFocus.focus) { try { previousFocus.focus(); } catch {} }
          resolve(value);
        };
        const onKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        };
        closeConfirm = finish;
        cancel.addEventListener('click', () => finish(false));
        ok.addEventListener('click', () => finish(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
        cancel.focus();
      });
    }

    // ---- Ações delegadas ------------------------------------------------------
    // Um listener por tipo de evento no document; os dados vêm de data-* (nunca de onclick interpolado).
    // data-act="nome" dispara no clique (ou Enter/Espaço em [role=button]); data-act-input="nome" dispara em input
    // (e em change de <input type=file>). O handler recebe (elemento, evento).
    const actions = Object.create(null);
    function registerAction(name, fn) {
      actions[name] = fn;
    }
    function runAction(fn, el, ev) {
      Promise.resolve().then(() => fn(el, ev)).catch((err) => reportError(err));
    }
    document.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      const fn = actions[el.getAttribute('data-act')];
      if (!fn) return;
      if (el.tagName === 'A') {
        const href = el.getAttribute('href');
        if (!href || href.charAt(0) === '#') e.preventDefault();
      }
      runAction(fn, el, e);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target && e.target.closest ? e.target.closest('[data-act][role="button"]') : null;
      if (!el || el !== e.target) return;
      const fn = actions[el.getAttribute('data-act')];
      if (!fn) return;
      e.preventDefault();
      runAction(fn, el, e);
    });
    function onInputLike(e) {
      const el = e.target && e.target.closest ? e.target.closest('[data-act-input]') : null;
      if (!el) return;
      if (e.type === 'change' && el.type !== 'file') return;
      const fn = actions[el.getAttribute('data-act-input')];
      if (fn) runAction(fn, el, e);
    }
    document.addEventListener('input', onInputLike);
    document.addEventListener('change', onInputLike);

    registerAction('goto-tab', (el) => switchTab(el.dataset.tab));

    // ---- Edição em andamento / atualização do detalhe aberto --------------------
    let shellDirty = false;
    document.addEventListener('input', (e) => {
      if (e.target && e.target.closest && e.target.closest('#detailStepShell')) shellDirty = true;
    }, true);
    // Etapas com estado de edição fora do DOM registram aqui um verificador () => boolean.
    const dirtyChecks = [];
    function registerDirtyCheck(fn) {
      dirtyChecks.push(fn);
    }
    function markShellClean() {
      shellDirty = false;
    }
    function hasUnsavedEdits() {
      const shell = document.getElementById('detailStepShell');
      const ae = document.activeElement;
      if (shell && ae && ae !== document.body && shell.contains(ae) && ae.matches && ae.matches('input, textarea, select, [contenteditable]')) return true;
      if (shellDirty) return true;
      for (const check of dirtyChecks) {
        try { if (check()) return true; } catch {}
      }
      return false;
    }
    function showStaleBanner(on) {
      if (staleBanner) staleBanner.style.display = on ? 'block' : 'none';
    }
    // refreshActive({ keepEdits }): recarrega o detalhe aberto. Com keepEdits (padrão), nunca troca o DOM sob edição:
    // mostra a faixa "Atualizado no computador — toque para recarregar". keepEdits:false força a troca.
    async function refreshActive(opts) {
      const keepEdits = !(opts && opts.keepEdits === false);
      if (!activeProject || projectDetailView.style.display === 'none') return;
      if (keepEdits && hasUnsavedEdits()) { showStaleBanner(true); return; }
      const stepId = activeProject.journey && activeProject.journey.steps && activeProject.journey.steps[activeStepIndex] ? activeProject.journey.steps[activeStepIndex].id : undefined;
      await window.openProjectDetail(activeProject.id, stepId, true, { keepEdits });
    }
    registerAction('refresh-stale', () => refreshActive({ keepEdits: false }));

    // ---- Mídia quebrada ---------------------------------------------------------
    let lastMediaRefresh = 0;
    function mediaPlaceholder(el) {
      const box = document.createElement('div');
      box.className = 'media-missing';
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', 'Mídia indisponível');
      const label = document.createElement('span');
      label.textContent = 'Mídia indisponível';
      box.appendChild(label);
      if (el.parentNode) el.parentNode.replaceChild(box, el);
    }
    // Uma vez a cada 20 s refaz o fetch do projeto aberto (ou da lista) para renovar os tokens de mídia;
    // se a mídia continuar falhando, troca por um placeholder.
    async function onMediaError(el) {
      if (!el || !el.tagName || el.dataset.mediaFailed) return;
      el.dataset.mediaFailed = '1';
      const now = Date.now();
      if (now - lastMediaRefresh < 20000 || !session) { mediaPlaceholder(el); return; }
      lastMediaRefresh = now;
      const inDetail = !!(el.closest && el.closest('#projectDetailView')) && activeProject;
      mediaPlaceholder(el);
      try {
        if (inDetail) await refreshActive({ keepEdits: true });
        else await loadProjects();
      } catch {}
    }
    window.onMediaError = onMediaError;
    document.addEventListener('error', (e) => {
      let t = e.target;
      if (!t || !t.tagName) return;
      if (t.tagName === 'SOURCE') t = t.parentElement;
      if (!t || !/^(IMG|VIDEO|AUDIO)$/.test(t.tagName) || t.hasAttribute('data-no-guard')) return;
      onMediaError(t);
    }, true);

    // PIN inputs navigation
    pinBoxes.forEach((box, i) => {
      box.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase();
        e.target.value = val;
        if (val && i < pinBoxes.length - 1) {
          pinBoxes[i + 1].focus();
        }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          pinBoxes[i - 1].focus();
        }
      });
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (text) {
          for (let j = 0; j < pinBoxes.length; j++) {
            pinBoxes[j].value = text[j] || '';
          }
          if (text.length >= 6) {
            submitAuth();
          }
        }
      });
    });

    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitAuth();
    });

`;
