// Lista de projetos, detalhe, casca das etapas e navegação.
export const SCRIPT_PROJECTS = `    // Load Projects
    let projectsSeq = 0;
    async function loadProjects() {
      const seq = ++projectsSeq;
      try {
        const data = await api('/api/projects');
        if (seq !== projectsSeq || !Array.isArray(data)) return;
        projectsData = data;
        projectsLoaded = true;
        renderProjects();
      } catch (err) {
        if (err.kind === 'server') toast(err.message, 'error');
      }
    }

    function renderProjects() {
      if (!projectsLoaded) {
        projectsList.innerHTML = '<div class="empty-state"><p>Carregando projetos…</p></div>';
        return;
      }
      const filtered = projectsData.filter(p => {
        if (currentFilter === 'all') return true;
        return p.kind === currentFilter;
      });

      if (filtered.length === 0) {
        projectsList.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </div>
            <p>Nenhum projeto encontrado nesta categoria.</p>
            <button type="button" class="btn-primary" style="margin-top: 14px; width: auto;" data-act="open-create">Criar Primeiro Conteúdo</button>
          </div>
        \`;
        return;
      }

      projectsList.innerHTML = filtered.map(p => \`
        <div class="project-card" role="button" tabindex="0" data-act="open-project" data-id="\${esc(p.id)}">
          <div class="project-thumb">
            \${p.coverUrl ? \`<img src="\${esc(p.coverUrl)}" alt="" loading="lazy">\` : \`
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            \`}
          </div>
          <div class="project-info">
            <div class="project-title">\${esc(p.title)}</div>
            <div class="project-badges">
              <span class="tag kind-\${esc(p.kind)}">\${p.kind === 'image' ? 'Carrossel' : 'Vídeo'}</span>
              \${p.format ? \`<span class="tag">\${esc(formatLabel(p.format))}</span>\` : ''}
            </div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      \`).join('');
    }

    registerAction('open-project', (el) => window.openProjectDetail(el.dataset.id));

    // Prompt Recipes Dropdown
    async function loadPromptRecipes() {
      try {
        const data = await api('/api/prompt-recipes');
        if (Array.isArray(data)) {
          promptRecipes = data;
          updateRecipeDropdown();
        }
      } catch {}
    }

    function updateRecipeDropdown() {
      const select = document.getElementById('createRecipe');
      if (!select) return;
      const filtered = promptRecipes.filter(r => r.kind === selectedCreateKind);
      select.innerHTML = '<option value="custom">✏️ Personalizado (Livre)</option>' +
        filtered.map(r => \`<option value="\${esc(r.id)}">\${esc(r.title)} (\${esc(r.category)})</option>\`).join('');
    }

    const recipeSelect = document.getElementById('createRecipe');
    if (recipeSelect) {
      recipeSelect.addEventListener('change', () => {
        const recId = recipeSelect.value;
        if (recId === 'custom') return;
        const found = promptRecipes.find(r => r.id === recId);
        if (found) {
          const topicInput = document.getElementById('createTopic');
          if (!topicInput.value.trim()) {
            topicInput.value = found.description || '';
            const titleInput = document.getElementById('createTitle');
            if (!titleInput.dataset.manual) {
              const prefix = selectedCreateKind === 'image' ? 'Carrossel: ' : 'Vídeo: ';
              titleInput.value = prefix + found.title;
            }
          }
        }
      });
    }

    // Project Detail & Journey View
    // openProjectDetail(id, stepId?, silent?, { keepEdits }?) — silent = re-render sem navegar; keepEdits = não trocar o DOM sob edição.
    let detailSeq = 0;
    window.openProjectDetail = async (id, targetStepId, silent, opts) => {
      const seq = ++detailSeq;
      let project;
      try {
        project = await api('/api/projects/' + encodeURIComponent(id));
      } catch (err) {
        if (!silent) reportError(err, 'Não foi possível abrir o projeto.');
        return;
      }
      if (seq !== detailSeq || !project) return;
      if (opts && opts.keepEdits && hasUnsavedEdits()) {
        showStaleBanner(true);
        return;
      }
      const switching = !activeProject || activeProject.id !== project.id;
      const scrollY = window.scrollY;
      if (switching) revisionDrafts = {};
      activeProject = project;

      const steps = project.journey?.steps || [];
      if (targetStepId) {
        const idx = steps.findIndex(s => s.id === targetStepId);
        if (idx >= 0) activeStepIndex = idx;
      } else if (!silent) {
        if (project.journey?.nextStep) {
          const idx = steps.findIndex(s => s.id === project.journey.nextStep.id);
          if (idx >= 0) activeStepIndex = idx;
        } else {
          activeStepIndex = 0;
        }
      } else if (activeStepIndex >= steps.length) {
        activeStepIndex = 0;
      }

      renderProjectJourneyView();

      if (!silent) {
        projectsView.style.display = 'none';
        projectDetailView.style.display = 'flex';
        scrollToY(0);
      } else if (!switching) {
        window.scrollTo(0, scrollY);
      }
    };

    function renderProjectJourneyView() {
      if (!activeProject) return;

      showStaleBanner(false);
      document.getElementById('detailTitle').textContent = activeProject.title;
      document.getElementById('detailBadges').innerHTML = \`
        <span class="tag kind-\${esc(activeProject.kind)}">\${activeProject.kind === 'image' ? 'Carrossel (PostNow)' : 'Vídeo (VideoGo)'}</span>
        \${activeProject.format ? \`<span class="tag">\${esc(formatLabel(activeProject.format))}</span>\` : ''}
        <span class="tag">\${esc((activeProject.assets || []).length)} arquivos</span>
        <span class="tag">\${esc(new Date(activeProject.createdAt).toLocaleDateString())}</span>
      \`;

      // Render Step Bar
      const stepBar = document.getElementById('detailStepBar');
      const steps = activeProject.journey?.steps || [];
      stepBar.innerHTML = steps.map((step, idx) => {
        const isCurrent = idx === activeStepIndex;
        const icon = step.status === 'done' ? '✓' : step.status === 'running' ? '⚡' : step.status === 'blocked' ? '🔒' : (idx + 1);

        return \`
          <button type="button" class="step-pill \${esc(step.status)} \${isCurrent ? 'selected-view' : ''}" data-act="select-step" data-idx="\${idx}" \${isCurrent ? 'aria-current="step"' : ''}>
            <span>\${icon}</span>
            <span>\${esc(step.title)}</span>
          </button>
        \`;
      }).join('');

      renderActiveStep();
      renderProjectAssetsGallery();
    }

    function renderActiveStep() {
      if (!activeProject) return;
      const steps = activeProject.journey?.steps || [];
      const currentStep = steps[activeStepIndex] || steps[0];
      if (!currentStep) return;

      const shell = document.getElementById('detailStepShell');
      const totalSteps = steps.length;
      const isRunning = activeProject.isRunning;

      // Running Banner
      const runningBanner = isRunning ? \`
        <div class="step-alert warning" style="animation: pulseBorder 1.5s infinite alternate;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          <div>
            <strong>Agente de IA em execução</strong>
            <p style="font-size: 12px; margin-top: 2px;">O modelo está processando esta etapa agora. <a href="#" data-act="goto-tab" data-tab="live" style="color: var(--accent); font-weight: 600;">Ver no terminal</a></p>
          </div>
        </div>
      \` : '';

      // Render according to step.id

      const stepCtx = { totalSteps, runningBanner, isRunning };
      const renderers = {
        brief: stepBrief,
        texts: stepTexts,
        script: stepScript,
        images: stepImages,
        voice: stepVoice,
        render: stepRender,
        review: (c) => activeProject.kind === 'image' ? stepReviewImage(c) : stepReviewVideo(c),
        export: (c) => activeProject.kind === 'image' ? stepExportImage(c) : stepExportVideo(c),
      };
      const contentHtml = renderers[currentStep.id] ? renderers[currentStep.id](stepCtx) : '';

      // Step Navigation Footer
      const advance = activeProject.kind === 'image'
        ? (['brief', 'texts', 'images', 'review'].includes(currentStep.id) ? computeAdvance(currentStep.id) : null)
        : computeVideoAdvance(currentStep.id);
      let canGoNext = currentStep.status === 'done' || activeStepIndex === totalSteps - 1;
      let nextHint = '';
      if (advance) {
        nextHint = advance.hint || '';
      } else if (!canGoNext) {
        if (currentStep.id === 'brief') nextHint = 'Salve a pauta ou prepare os textos para avançar.';
        else if (currentStep.id === 'script') nextHint = 'Aprove o roteiro para poder renderizar o vídeo.';
        else if (currentStep.id === 'render') nextHint = 'Renderize o vídeo para poder revisá-lo.';
        else if (currentStep.id === 'review') nextHint = 'Aprove todos os itens para liberar a entrega.';
      }

      const nextButtonHtml = advance
        ? \`<button type="button" id="stepAdvanceBtn" class="btn-step-next" \${advance.enabled ? '' : 'disabled'} data-act="advance-step">\${esc(advance.label)}</button>\`
        : \`<button type="button" class="btn-step-next" \${canGoNext ? '' : 'disabled'} data-act="next-step">
            \${activeStepIndex === totalSteps - 1 ? 'Concluído' : 'Próximo →'}
          </button>\`;

      const footerHtml = \`
        <div class="step-nav-footer">
          <button type="button" class="btn-step-prev" \${activeStepIndex === 0 ? 'disabled style="opacity: 0.35;"' : ''} data-act="prev-step">
            ← Voltar
          </button>
          \${nextButtonHtml}
        </div>
        <div id="stepAdvanceHint" class="step-hint-text" \${nextHint ? '' : 'style="display: none;"'}>\${esc(nextHint)}</div>
      \`;

      shell.innerHTML = contentHtml + footerHtml;
      markShellClean();
    }

    function selectStep(idx) {
      const steps = activeProject?.journey?.steps || [];
      if (idx >= 0 && idx < steps.length) {
        activeStepIndex = idx;
        renderProjectJourneyView();
      }
    }

    function prevStep() {
      if (activeStepIndex > 0) {
        activeStepIndex--;
        renderProjectJourneyView();
        scrollToY(100);
      }
    }

    function nextStep() {
      const steps = activeProject?.journey?.steps || [];
      if (activeStepIndex < steps.length - 1) {
        activeStepIndex++;
        renderProjectJourneyView();
        scrollToY(100);
      }
    }

    // As etapas de imagem/vídeo ainda chamam estes pela window.
    window.selectStep = selectStep;
    window.prevStep = prevStep;
    window.nextStep = nextStep;

    registerAction('select-step', (el) => selectStep(Number(el.dataset.idx)));
    registerAction('prev-step', prevStep);
    registerAction('next-step', nextStep);
    registerAction('advance-step', () => (activeProject && activeProject.kind === 'image' ? window.advanceStep() : advanceVideoStep()));
    registerAction('open-create', () => openCreateModal());

    // ---- Ações do projeto (POST /api/projects/:id/action) ----------------------------
    // Ações com custo exigem confirmCost antes e só então enviam confirm:true.
    const COST_ACTION_MESSAGES = {
      'start-agent': 'Isto aciona o agente de IA e consome créditos do provedor. Continuar?',
      'prepare-texts': 'Preparar os textos aciona o agente de IA e consome créditos do provedor. Continuar?',
      'generate-images': 'Gerar as imagens consome créditos do gerador de imagens. Continuar?',
      'revise-images': 'Regerar as imagens marcadas consome créditos do gerador de imagens. Continuar?',
      'request-video-revision': 'Pedir a revisão do vídeo aciona o agente de IA e consome créditos. Continuar?',
      'render': 'Renderizar o vídeo usa o processamento do computador e pode demorar. Continuar?',
    };

    // projectAction(action, extra?, { cost?, confirmed? }?) -> resposta do servidor | null (recusado ou com erro, já avisado por toast).
    // Para ações com custo, abre confirmCost (mensagem própria em opts.cost) e envia confirm:true somente se o usuário tocar em Continuar;
    // quem já confirmou por conta própria passa { confirmed: true }.
    async function projectAction(action, extra, opts) {
      if (!activeProject) return null;
      const o = opts || {};
      const body = Object.assign({ action }, extra || {});
      const costMessage = o.cost || COST_ACTION_MESSAGES[action];
      if (costMessage || o.confirmed) {
        if (!o.confirmed && !(await confirmCost(costMessage))) return null;
        body.confirm = true;
      }
      try {
        return await api('/api/projects/' + encodeURIComponent(activeProject.id) + '/action', { method: 'POST', body });
      } catch (err) {
        reportError(err);
        return null;
      }
    }

    registerAction('run-project-action', async (el) => {
      const data = await projectAction(el.dataset.action);
      if (data) switchTab('live');
    });

    document.getElementById('sendAgentPromptBtn').addEventListener('click', async () => {
      if (!activeProject) return;
      const input = document.getElementById('agentPromptText');
      const btn = document.getElementById('sendAgentPromptBtn');
      const text = input.value.trim();
      if (!text || btn.disabled) return;
      btn.disabled = true;
      try {
        const data = await projectAction('start-agent', { prompt: text });
        if (data) {
          input.value = '';
          switchTab('live');
        }
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('backToProjectsBtn').addEventListener('click', () => {
      showStaleBanner(false);
      projectDetailView.style.display = 'none';
      projectsView.style.display = 'block';
    });

`;
