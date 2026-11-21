// SSE com watchdog e polling por rev, tarefas, interações e terminal incremental.
export const SCRIPT_LIVE = `    // ---- Tempo real: SSE + watchdog + polling -----------------------------------
    const SSE_SILENCE_MS = 20000;
    const POLL_MS = 4000;
    let sseGotFrame = false;
    let sseEverLive = false;
    let sseBackoff = 1000;
    let sseTimer = null;
    let sseConnectedAt = 0;
    let lastFrameAt = 0;
    let watchdogTimer = null;
    let pollTimer = null;
    let pollBusy = false;
    let lastRev = null;
    let liveMode = 'connecting';
    let syncTimer = null;
    let pendingLists = false;
    let pendingJobs = false;
    let pendingDetail = false;
    let lastSessionProbe = 0;
    let jobsSeq = 0;

    function setLive(mode) {
      liveMode = mode;
      if (mode === 'live') {
        liveDot.className = 'live-dot connected';
        liveText.textContent = 'Ao Vivo';
      } else if (mode === 'polling') {
        liveDot.className = 'live-dot warn';
        liveText.textContent = 'Sem tempo real';
      } else if (mode === 'reconnecting') {
        liveDot.className = 'live-dot warn';
        liveText.textContent = 'Reconectando...';
      } else {
        liveDot.className = 'live-dot warn';
        liveText.textContent = 'Conectando...';
      }
    }

    function closeSse() {
      if (sseTimer) { clearTimeout(sseTimer); sseTimer = null; }
      if (eventSource) {
        eventSource.onopen = null;
        eventSource.onerror = null;
        eventSource.onmessage = null;
        eventSource.close();
        eventSource = null;
      }
    }

    function stopPolling() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      pollBusy = false;
    }

    // Para tudo: SSE, polling, watchdog e sincronização pendente (sessão encerrada ou PIN).
    function closeLive() {
      closeSse();
      stopPolling();
      if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
      pendingLists = pendingJobs = pendingDetail = false;
      lastRev = null;
      sseGotFrame = false;
      sseEverLive = false;
      resetTerminal('Aguardando saída dos processos...');
    }

    // Entrada do tempo real ao abrir o app.
    function startLive() {
      closeLive();
      lastFrameAt = Date.now();
      sseBackoff = 1000;
      setLive('connecting');
      connectSse();
      watchdogTimer = setInterval(watchdog, 2000);
    }

    // O estado "Ao Vivo" só vale depois do primeiro frame recebido (inclusive ping); onopen não conta,
    // porque o edge do túnel pode abrir a conexão sem entregar o corpo.
    function connectSse() {
      closeSse();
      if (!session) return;
      sseGotFrame = false;
      sseConnectedAt = Date.now();
      if (liveMode !== 'polling') setLive(sseEverLive ? 'reconnecting' : 'connecting');
      const es = new EventSource('/api/events?token=' + encodeURIComponent(session));
      eventSource = es;

      es.onerror = () => {
        if (eventSource !== es) return;
        sseGotFrame = false;
        es.close();
        eventSource = null;
        if (liveMode !== 'polling') setLive('reconnecting');
        probeSession();
        sseTimer = setTimeout(connectSse, sseBackoff);
        sseBackoff = Math.min(sseBackoff * 2, 15000);
      };

      es.onmessage = (e) => {
        if (eventSource !== es) return;
        onFrame();
        let event;
        try { event = JSON.parse(e.data); } catch { return; }
        handleAppEvent(event);
      };
    }

    function probeSession() {
      const now = Date.now();
      if (now - lastSessionProbe < 8000) return;
      lastSessionProbe = now;
      api('/api/rev').catch(() => {});
    }

    function onFrame() {
      lastFrameAt = Date.now();
      if (sseGotFrame) return;
      sseGotFrame = true;
      sseBackoff = 1000;
      const reconnect = sseEverLive;
      sseEverLive = true;
      stopPolling();
      setLive('live');
      if (reconnect) scheduleSync({ lists: true, jobs: true, detail: true });
    }

    function watchdog() {
      if (!session || !appActive) return;
      const silent = Date.now() - lastFrameAt;
      if (silent > SSE_SILENCE_MS && liveMode !== 'polling') {
        sseGotFrame = false;
        setLive('polling');
        startPolling();
      }
      // Conexão presa (buffer do edge): recicla a cada 2x o limite sem frames.
      if (silent > SSE_SILENCE_MS * 2 && Date.now() - sseConnectedAt > SSE_SILENCE_MS * 2) connectSse();
    }

    function startPolling() {
      if (pollTimer) return;
      lastRev = null;
      pollTimer = setInterval(pollTick, POLL_MS);
      pollTick();
    }

    // Sem SSE: consulta /api/rev + /api/jobs; só recarrega lista/detalhe quando rev muda ou um job termina.
    async function pollTick() {
      if (pollBusy || !session || document.visibilityState !== 'visible') return;
      pollBusy = true;
      try {
        const [revData, jobs] = await Promise.all([api('/api/rev'), api('/api/jobs')]);
        if (!pollTimer || !Array.isArray(jobs)) return;
        const prev = jobsData;
        const finished = jobs.some((j) => j.status !== 'running' && prev.some((p) => p.id === j.id && p.status === 'running'));
        const rev = revData ? revData.rev : null;
        const revChanged = lastRev === null || rev !== lastRev;
        lastRev = rev;
        jobsData = jobs;
        renderJobs();
        if (revChanged || finished) scheduleSync({ lists: true, detail: true });
      } catch {
      } finally {
        pollBusy = false;
      }
    }

    // Reconexão do transporte (a rede voltou): reabre o SSE e ressincroniza.
    function onReconnected() {
      if (!appActive) return;
      if (!eventSource || !sseGotFrame) connectSse();
      scheduleSync({ lists: true, jobs: true, detail: true });
    }

    // Debounce de 300 ms para refresh/job: junta pedidos e recarrega uma vez.
    function scheduleSync(flags) {
      if (flags.lists) pendingLists = true;
      if (flags.jobs) pendingJobs = true;
      if (flags.detail) pendingDetail = true;
      if (syncTimer) return;
      syncTimer = setTimeout(runSync, 300);
    }

    function runSync() {
      syncTimer = null;
      const lists = pendingLists;
      const jobs = pendingJobs;
      const detail = pendingDetail;
      pendingLists = pendingJobs = pendingDetail = false;
      if (!session || !appActive) return;
      if (lists) loadProjects();
      if (jobs) loadJobs();
      if (detail) refreshActive({ keepEdits: true }).catch(() => {});
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !session || !appActive) return;
      watchdog();
      if (liveMode === 'polling') pollTick();
      else scheduleSync({ lists: true, jobs: true, detail: true });
    });

    function handleAppEvent(ev) {
      if (!ev || ev.type === 'ping') return;
      if (ev.type === 'snapshot') {
        jobsData = ev.jobs || [];
        projectsData = ev.projects || [];
        projectsLoaded = true;
        renderJobs();
        renderProjects();
      } else if (ev.type === 'job' && ev.job) {
        const idx = jobsData.findIndex(j => j.id === ev.job.id);
        const before = idx >= 0 ? jobsData[idx] : null;
        if (before) {
          if (before.currentActivity && ev.job.status === 'running' && !ev.job.currentActivity) ev.job.currentActivity = before.currentActivity;
          jobsData[idx] = ev.job;
        } else {
          jobsData.unshift(ev.job);
        }
        renderJobs();
        const statusChanged = !before || before.status !== ev.job.status;
        const sameProject = !!(activeProject && ev.job.projectId === activeProject.id);
        if (statusChanged || sameProject) scheduleSync({ lists: statusChanged && ev.job.status !== 'running', detail: sameProject });
      } else if (ev.type === 'output') {
        appendTerminal(ev.jobId, ev.data || '');
      } else if (ev.type === 'activity') {
        const job = jobsData.find(j => j.id === ev.jobId);
        if (job) {
          job.currentActivity = ev.activity ? ev.activity.text : undefined;
          renderJobs();
        }
      } else if (ev.type === 'refresh') {
        scheduleSync({ lists: true, jobs: true, detail: true });
      }
    }

    // ---- Terminal incremental ------------------------------------------------------
    const TERMINAL_MAX_LINES = 500;
    const TERMINAL_MAX_NODES = 3000;
    let termNodes = [];
    let termLines = 0;
    let termAtLineStart = true;
    let termLastJob = null;
    let termHasContent = false;

    function resetTerminal(placeholder) {
      terminalStream.textContent = placeholder || '';
      termNodes = [];
      termLines = 0;
      termAtLineStart = true;
      termLastJob = null;
      termHasContent = false;
    }

    function jobLabel(jobId) {
      const job = jobsData.find(j => j.id === jobId);
      const title = job && job.title ? String(job.title) : String(jobId || '').slice(0, 6);
      return title.length > 16 ? title.slice(0, 15) + '…' : title;
    }

    function stripAnsi(text) {
      return String(text || '').replace(/\\x1B\\[[0-9;?]*[a-zA-Z]/g, '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '');
    }

    function termAppendNode(text, lines, history) {
      const node = document.createTextNode(text);
      terminalStream.appendChild(node);
      termNodes.push({ node, lines: history ? 0 : lines, history: !!history });
      if (!history) termLines += lines;
    }

    function termScroll() {
      if (autoScrollCheck.checked) terminalStream.scrollTop = terminalStream.scrollHeight;
    }

    function appendTerminal(jobId, raw) {
      const clean = stripAnsi(raw);
      if (!clean) return;
      if (!termHasContent) {
        terminalStream.textContent = '';
        termHasContent = true;
      }
      const multi = jobsData.filter(j => j.status === 'running').length > 1;
      let out = '';
      if (multi && termLastJob !== null && termLastJob !== jobId && !termAtLineStart) {
        out += '\\n';
        termAtLineStart = true;
      }
      const parts = clean.split('\\n');
      for (let i = 0; i < parts.length; i++) {
        const piece = parts[i];
        if (piece) {
          if (multi && termAtLineStart) out += '[' + jobLabel(jobId) + '] ';
          out += piece;
          termAtLineStart = false;
        }
        if (i < parts.length - 1) {
          out += '\\n';
          termAtLineStart = true;
        }
      }
      termLastJob = jobId;
      termAppendNode(out, (out.match(/\\n/g) || []).length, false);
      while (termLines > TERMINAL_MAX_LINES || termNodes.length > TERMINAL_MAX_NODES) {
        const idx = termNodes.findIndex(n => !n.history);
        if (idx < 0) break;
        const removed = termNodes.splice(idx, 1)[0];
        if (removed.node.parentNode) removed.node.parentNode.removeChild(removed.node);
        termLines -= removed.lines;
      }
      termScroll();
    }

    // ---- Tarefas -----------------------------------------------------------------
    async function loadJobs() {
      const seq = ++jobsSeq;
      try {
        const data = await api('/api/jobs');
        if (seq !== jobsSeq || !Array.isArray(data)) return;
        data.forEach((job) => {
          const old = jobsData.find(j => j.id === job.id);
          if (old && old.currentActivity && job.status === 'running' && !job.currentActivity) job.currentActivity = old.currentActivity;
        });
        jobsData = data;
        renderJobs();
      } catch {}
    }

    function safeHttpUrl(url) {
      return /^https?:\\/\\//i.test(String(url || '')) ? String(url) : '';
    }

    function interactionKey(job) {
      const req = job.interactionRequest;
      return job.id + '|' + req.kind + '|' + req.prompt + '|' + (req.userCode || '') + '|' + JSON.stringify(req.choices || []);
    }

    function interactionHtml(job) {
      const req = job.interactionRequest;
      const id = esc(job.id);
      const url = safeHttpUrl(req.verificationUrl);
      const choices = Array.isArray(req.choices) ? req.choices : [];
      const typed = req.kind === 'password' || req.kind === 'text';
      const showDismiss = req.kind === 'device-auth' || (!typed && choices.length === 0);
      return \`
        <div class="interaction-box">
          <div class="interaction-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Atenção: Ação necessária do agente</span>
          </div>
          <p style="font-size: 13px; color: var(--fg);">\${esc(req.prompt)}</p>
          \${req.userCode ? \`<div class="interaction-code">\${esc(req.userCode)}</div>\` : ''}
          \${typed ? \`<input class="interaction-input" type="\${req.kind === 'password' ? 'password' : 'text'}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-interaction-input="\${id}" aria-label="Resposta para o agente">\` : ''}
          \${choices.length ? \`<div class="interaction-choices">\${choices.map(c => \`<button type="button" class="btn-sm btn-accent" data-act="interaction-choice" data-id="\${id}" data-value="\${esc(c.value)}">\${esc(c.label)}</button>\`).join('')}</div>\` : ''}
          <div class="interaction-actions">
            \${url ? \`<a href="\${esc(url)}" target="_blank" rel="noopener noreferrer" class="btn-sm btn-accent" style="text-decoration:none;">Abrir Página Segura</a>\` : ''}
            \${typed ? \`<button type="button" class="btn-sm btn-accent" data-act="interaction-send" data-id="\${id}">Enviar</button>\` : ''}
            \${showDismiss ? \`<button type="button" class="btn-sm btn-secondary" data-act="interaction-dismiss" data-id="\${id}">Dispensar</button>\` : ''}
          </div>
        </div>
      \`;
    }

    let renderedInteractionKey = '';

    function renderInteractions(running) {
      const waiting = running.filter(j => j.interactionRequest);
      const key = waiting.map(interactionKey).join('||');
      if (key === renderedInteractionKey) return;
      renderedInteractionKey = key;
      interactionContainer.innerHTML = waiting.map(interactionHtml).join('');
    }

    function renderJobs() {
      const running = jobsData.filter(j => j.status === 'running');
      const recent = jobsData.filter(j => j.status !== 'running').slice(0, 15);

      activeJobsCount.textContent = running.length + ' ativa(s)';

      renderInteractions(running);

      // Running jobs
      if (running.length === 0) {
        runningJobsList.innerHTML = \`
          <div class="card" style="color: var(--muted); font-size: 13px; text-align: center; padding: 20px;">
            Nenhuma tarefa em execução no momento.
          </div>
        \`;
      } else {
        runningJobsList.innerHTML = running.map(job => \`
          <div class="card job-card running">
            <div class="job-header">
              <span class="job-title">\${esc(job.title)}</span>
              <span class="status-badge running">Executando</span>
            </div>
            \${job.currentActivity ? \`<div class="job-activity"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg> \${esc(job.currentActivity)}</div>\` : ''}
            <div class="job-meta">Iniciado em \${esc(new Date(job.createdAt).toLocaleTimeString())}</div>
            <div class="interaction-actions" style="margin-top: 8px;">
              <button type="button" class="btn-sm btn-secondary" data-act="cancel-job" data-id="\${esc(job.id)}">Cancelar</button>
            </div>
          </div>
        \`).join('');
      }

      // Recent jobs
      if (recent.length === 0) {
        recentJobsList.innerHTML = \`
          <div class="card" style="color: var(--muted); font-size: 13px; text-align: center; padding: 20px;">
            Nenhuma tarefa finalizada no histórico recente.
          </div>
        \`;
      } else {
        recentJobsList.innerHTML = recent.map(job => \`
          <div class="card job-card \${esc(job.status)}" role="button" tabindex="0" data-act="view-job-logs" data-id="\${esc(job.id)}" style="cursor: pointer;">
            <div class="job-header">
              <span class="job-title">\${esc(job.title)}</span>
              <span class="status-badge \${esc(job.status)}">\${job.status === 'succeeded' ? 'Concluído' : job.status === 'failed' ? 'Falhou' : 'Cancelado'}</span>
            </div>
            <div class="job-meta">
              <span>\${esc(new Date(job.createdAt).toLocaleString())}</span>
              \${job.endedAt ? \` · \${esc(Math.round((new Date(job.endedAt).getTime() - new Date(job.createdAt).getTime()) / 1000))}s\` : ''}
            </div>
          </div>
        \`).join('');
      }
    }

    // viewJobLogs: carrega o log completo (GET /api/jobs/:id) no terminal.
    async function viewJobLogs(jobId) {
      const job = await api('/api/jobs/' + encodeURIComponent(jobId));
      resetTerminal('');
      termHasContent = true;
      const log = stripAnsi(job && job.log);
      if (log) {
        termAppendNode(log, 0, true);
        termAtLineStart = /\\n$/.test(log);
      } else {
        terminalStream.textContent = 'Sem saída registrada para esta tarefa.';
      }
      terminalStream.scrollTop = 0;
      scrollToY(Math.max(0, terminalStream.offsetTop - 80));
    }
    registerAction('view-job-logs', (el) => viewJobLogs(el.dataset.id));

    registerAction('cancel-job', async (el) => {
      const ok = await confirmCost('Cancelar esta tarefa? O trabalho em andamento será interrompido.', { title: 'Cancelar tarefa', okLabel: 'Cancelar tarefa', cancelLabel: 'Manter' });
      if (!ok) return;
      await api('/api/jobs/' + encodeURIComponent(el.dataset.id) + '/cancel', { method: 'POST' });
      toast('Tarefa cancelada.');
      loadJobs();
    });

    registerAction('interaction-dismiss', async (el) => {
      await api('/api/jobs/' + encodeURIComponent(el.dataset.id) + '/dismiss', { method: 'POST' });
      loadJobs();
    });

    async function respondInteraction(jobId, value) {
      await api('/api/jobs/' + encodeURIComponent(jobId) + '/respond', { method: 'POST', body: { data: value } });
      toast('Resposta enviada ao agente.');
      loadJobs();
    }

    registerAction('interaction-choice', (el) => respondInteraction(el.dataset.id, el.dataset.value));

    registerAction('interaction-send', (el) => {
      const input = el.closest('.interaction-box').querySelector('.interaction-input');
      if (!input || !input.value) { toast('Digite a resposta antes de enviar.'); return; }
      const value = input.value;
      input.value = '';
      return respondInteraction(el.dataset.id, value);
    });

    interactionContainer.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('interaction-input')) return;
      e.preventDefault();
      const send = e.target.closest('.interaction-box').querySelector('[data-act="interaction-send"]');
      if (send) send.click();
    });

`;
