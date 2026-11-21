// PIN, sessão, abas, conexão e logout.
export const SCRIPT_AUTH = `    let authBusy = false;
    let appActive = false;
    let sessionRetry = 0;
    let qrObjectUrl = '';

    function setAuthBusy(on) {
      authBusy = on;
      authSubmitBtn.disabled = on;
    }

    function clearPinBoxes() {
      pinBoxes.forEach((b) => { b.value = ''; });
      if (authView.style.display !== 'none') pinBoxes[0].focus();
    }

    async function submitAuth() {
      if (authBusy) return;
      let pin = '';
      pinBoxes.forEach(b => pin += b.value);
      if (pin.length !== 6) {
        showAuthError('Digite os 6 caracteres do código.');
        return;
      }
      authError.style.display = 'none';
      setAuthBusy(true);
      try {
        const data = await api('/api/auth', { method: 'POST', body: { token: pin }, auth: false });
        if (!data || !data.ok || !data.sessionToken) {
          showAuthError((data && data.error) || 'Código incorreto.');
          clearPinBoxes();
          return;
        }
        session = data.sessionToken;
        localStorage.setItem(SESSION_KEY, session);
        enterApp();
      } catch (err) {
        if (err.kind === 'offline') {
          showAuthError(linkDead ? PERMANENT_MSG : 'Sem conexão com o computador. Confira se o app está aberto e se o link é o atual.');
        } else {
          showAuthError(err.message || 'Código incorreto.');
          clearPinBoxes();
        }
      } finally {
        setAuthBusy(false);
      }
    }

    function showAuthError(msg) {
      authError.textContent = msg;
      authError.style.display = 'block';
    }

    // Sessão existente: 401/não autenticado ⇒ PIN; rede fora ⇒ faixa offline e nova tentativa.
    async function checkSession() {
      if (!session) {
        showAuthView();
        return;
      }
      liveDot.className = 'live-dot warn';
      liveText.textContent = 'Conectando...';
      try {
        const data = await api('/api/status');
        if (data && data.authenticated) {
          sessionRetry = 0;
          enterApp();
        } else {
          handleAuthFailure(EXPIRED_MSG);
        }
      } catch (err) {
        if (err.kind !== 'auth' && session && !linkDead) {
          sessionRetry++;
          setTimeout(checkSession, Math.min(10000, 1500 * sessionRetry));
        }
      }
    }

    function showAuthView(message) {
      appActive = false;
      closeLive();
      if (closeConfirm) closeConfirm(false);
      activeProject = null;
      projectsData = [];
      projectsLoaded = false;
      jobsData = [];
      showStaleBanner(false);
      createProjectModal.style.display = 'none';
      lightboxModal.style.display = 'none';
      authView.style.display = 'flex';
      liveView.style.display = 'none';
      projectsView.style.display = 'none';
      projectDetailView.style.display = 'none';
      connView.style.display = 'none';
      bottomNav.style.display = 'none';
      topCreateBtn.style.display = 'none';
      liveDot.className = 'live-dot';
      liveText.textContent = 'Não pareado';
      setAuthBusy(false);
      if (message) {
        showAuthError(message);
        clearPinBoxes();
      } else {
        authError.style.display = 'none';
      }
    }

    function enterApp() {
      appActive = true;
      authError.style.display = 'none';
      authView.style.display = 'none';
      bottomNav.style.display = 'flex';
      topCreateBtn.style.display = 'flex';
      switchTab('live');
      startLive();
      loadProjects();
      loadPromptRecipes();
    }

    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      liveView.style.display = tab === 'live' ? 'block' : 'none';
      projectsView.style.display = tab === 'projects' ? 'block' : 'none';
      projectDetailView.style.display = 'none';
      connView.style.display = tab === 'conn' ? 'block' : 'none';

      if (tab === 'live') loadJobs();
      if (tab === 'projects') loadProjects();
      if (tab === 'conn') loadSystemInfo();
    }

    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderProjects();
      });
    });

    // Refresh jobs manually
    if (refreshJobsBtn) {
      refreshJobsBtn.addEventListener('click', () => {
        loadJobs();
      });
    }

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await api('/api/logout', { method: 'POST', auth: false });
      } catch {}
      clearSession();
      showAuthView();
    });

    // Conexão: status autenticado (sem PIN) e QR buscado com Authorization.
    async function loadSystemInfo() {
      let data;
      try {
        data = await api('/api/status');
      } catch {
        return;
      }
      if (!data) return;
      document.getElementById('connTunnelStatus').textContent = data.tunnelUrl ? 'Cloudflare Tunnel Ativo' : 'Túnel Inativo';
      document.getElementById('connUrl').textContent = data.tunnelUrl || '-';
      document.getElementById('connWorkspace').textContent = data.workspace || '-';
      document.getElementById('connVersion').textContent = data.version ? 'v' + data.version : '-';

      const qrContainer = document.getElementById('qrContainer');
      try {
        const svgText = await api('/api/qr.svg', { as: 'text' });
        if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
        qrObjectUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
        qrContainer.textContent = '';
        const img = document.createElement('img');
        img.alt = 'QR Code de acesso';
        img.setAttribute('data-no-guard', '1');
        img.src = qrObjectUrl;
        qrContainer.appendChild(img);
      } catch (err) {
        qrContainer.textContent = err.kind === 'server' ? 'QR Code indisponível.' : 'Não foi possível carregar o QR Code.';
      }
    }

`;
