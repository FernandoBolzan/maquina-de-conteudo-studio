// Etapas de imagem/carrossel: pauta, textos, imagens, revisão, entrega e ações.
export const SCRIPT_IMAGE_STEPS = `    // ---- Peças comuns das etapas ----
    const ALERT_ICONS = {
      success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
      warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    };
    ALERT_ICONS.info = ALERT_ICONS.warning;

    // html já deve vir escapado por quem chama.
    function stepAlertHtml(kind, html) {
      return '<div class="step-alert ' + kind + '" role="status">' + ALERT_ICONS[kind] + '<div>' + html + '</div></div>';
    }

    function stepHeadHtml(ctx, label, title, desc) {
      return '<div class="step-eyebrow">Etapa ' + (activeStepIndex + 1) + ' de ' + ctx.totalSteps + ' · ' + esc(label) + '</div>'
        + '<div class="step-shell-title">' + esc(title) + '</div>'
        + '<p class="step-shell-desc">' + esc(desc) + '</p>'
        + (ctx.runningBanner || '');
    }

    function captionBoxHtml(caption, help) {
      if (!caption) return '';
      return '<div class="caption-box">'
        + '<div class="mdc-section-title" style="margin-top:0;">Legenda da publicação</div>'
        + (help ? '<p class="mdc-hint" style="margin-bottom:8px;">' + esc(help) + '</p>' : '')
        + '<div class="caption-text" id="captionText" tabindex="0">' + esc(caption) + '</div>'
        + '<button type="button" class="btn-sm btn-accent btn-touch" style="margin-top:10px;width:100%;" data-act="copy-caption">Copiar legenda</button>'
        + '</div>';
    }
    registerAction('copy-caption', () => {
      if (activeProject && activeProject.caption) return copyText(activeProject.caption);
    });

    function galleryOf(p) {
      return (p && p.gallery) || { items: [], source: 'none', state: 'none', stale: false };
    }
    function textsApproved(p) {
      const r = p && p.visualReview;
      return Boolean(r && r.ready && r.approved && !p.formatAdaptation);
    }
    function stepIndexOf(stepId) {
      const steps = (activeProject && activeProject.journey && activeProject.journey.steps) || [];
      return steps.findIndex(s => s.id === stepId);
    }
    function goToStepButtonHtml(stepId, label) {
      const idx = stepIndexOf(stepId);
      if (idx < 0) return '';
      return '<button type="button" class="btn-sm btn-secondary btn-touch" style="margin-top:8px;" data-act="select-step" data-idx="' + idx + '">' + esc(label) + '</button>';
    }

    // ---- Pauta ----
    let briefBrands = null;
    let briefBrandsAt = 0;
    let briefBrandsFailed = false;
    let briefBrandsBusy = false;

    async function loadBriefBrands() {
      if (briefBrandsBusy) return;
      briefBrandsBusy = true;
      try {
        const data = await api('/api/brands');
        if (Array.isArray(data)) { briefBrands = data; briefBrandsFailed = false; briefBrandsAt = Date.now(); }
      } catch {
        briefBrandsFailed = !briefBrands;
      } finally {
        briefBrandsBusy = false;
      }
      renderBrandBlock();
    }

    function brandBlockHtml() {
      const p = activeProject;
      if (!p) return '';
      if (!briefBrands) return '<div class="mdc-hint">' + (briefBrandsFailed ? 'Não foi possível carregar as marcas agora.' : 'Carregando marcas…') + '</div>';
      const brand = briefBrands.find(b => b.id === p.brandId);
      const options = ['<option value=""' + (p.brandId ? '' : ' selected') + '>Sem marca</option>'];
      if (p.brandId && !brand) options.push('<option value="' + esc(p.brandId) + '" selected>Marca removida (' + esc(p.brandId) + ')</option>');
      briefBrands.forEach(b => options.push('<option value="' + esc(b.id) + '"' + (b.id === p.brandId ? ' selected' : '') + '>' + esc(b.name) + (b.hasLogo ? '' : ' (sem logo)') + '</option>'));
      let note = '';
      if (p.kind === 'image') {
        if (!p.brandId) note = stepAlertHtml('warning', '<strong>Sem marca.</strong> Dá para preparar a pauta e os textos, mas gerar as imagens exige uma marca com logo oficial PNG.');
        else if (!brand) note = stepAlertHtml('warning', 'A marca vinculada não existe mais. Escolha outra para poder gerar as imagens.');
        else if (!brand.hasLogo) note = stepAlertHtml('warning', 'Esta marca não tem logo oficial PNG. Cadastre o logo no computador ou escolha outra marca para gerar as imagens.');
      }
      return '<label class="input-label" for="briefBrand">Marca do projeto</label>'
        + '<select id="briefBrand" class="form-control" data-act-input="set-brand">' + options.join('') + '</select>'
        + (note ? '<div style="margin-top:8px;">' + note + '</div>' : '');
    }
    function renderBrandBlock() {
      const host = document.getElementById('briefBrandHost');
      if (host) host.innerHTML = brandBlockHtml();
    }

    function briefDirty() {
      const el = document.getElementById('editBriefTopic');
      return Boolean(el && activeProject && el.value.trim() !== (activeProject.brief || '').trim());
    }

    function stepBrief(ctx) {
      const isVideo = activeProject.kind === 'video';
      if (!briefBrands || Date.now() - briefBrandsAt > 30000) setTimeout(loadBriefBrands, 0);
      return stepHeadHtml(ctx, 'Definir a Pauta', 'Pauta e Briefing Editorial', 'Revise o assunto, público-alvo e objetivo do conteúdo antes de preparar ' + (isVideo ? 'o roteiro.' : 'os textos.'))
        + '<div style="display:flex;flex-direction:column;gap:10px;">'
        + '<div class="form-group">'
        + '<label class="input-label" for="editBriefTopic">Tema / Pauta Principal</label>'
        + '<textarea id="editBriefTopic" class="form-control" rows="5" data-act-input="brief-input">' + esc(activeProject.brief || '') + '</textarea>'
        + '</div>'
        + '<div class="form-group" id="briefBrandHost">' + brandBlockHtml() + '</div>'
        + '<div style="display:flex;gap:8px;">'
        + '<button type="button" class="btn-sm btn-secondary btn-touch" style="flex:1;" data-act="save-brief">Salvar pauta</button>'
        + (isVideo ? '<button type="button" class="btn-sm btn-accent btn-touch" style="flex:1;" data-act="prepare-script"' + (ctx.isRunning ? ' disabled' : '') + '>Preparar roteiro (Claude)</button>' : '')
        + '</div>'
        + '</div>';
    }
    registerAction('brief-input', () => window.refreshAdvance());
    registerAction('save-brief', () => window.saveBrief());
    registerAction('prepare-script', () => window.prepareStepContent());
    registerAction('set-brand', async (el) => {
      if (!activeProject) return;
      const brandId = el.value;
      if (brandId === (activeProject.brandId || '')) return;
      const data = await projectAction('set-brand', { brandId });
      if (!data) { renderBrandBlock(); return; }
      activeProject.brandId = brandId || undefined;
      renderBrandBlock();
      toast(brandId ? 'Marca definida no projeto.' : 'Marca removida do projeto.');
      if (!briefDirty()) await refreshActive({ keepEdits: false });
      else window.refreshAdvance();
    });

    // ---- Textos ----
    const PERSON_OPTIONS = [
      ['none', 'Ninguém (apenas tipografia e elementos)'],
      ['other_person', 'Outra pessoa (banco / modelo)'],
      ['client_portrait', 'Cliente (retrato oficial aprovado)'],
    ];

    function textPageCardHtml(p, count) {
      const first = p.page === 1;
      const last = p.page === count;
      const person = p.depictedPerson || 'none';
      const personOptions = PERSON_OPTIONS.slice();
      if (!personOptions.some(o => o[0] === person)) personOptions.push([person, person]);
      const story = activeProject.visualStyle && activeProject.visualStyle.id === 'story-interaction-image';
      return '<div class="page-card" data-page="' + esc(p.page) + '">'
        + '<div class="page-card-header"><span>Página ' + esc(p.page) + ' ' + (first ? '(Capa)' : last ? '(Fechamento)' : '(Conteúdo)') + '</span>'
        + '<span class="page-card-badge">' + (first ? 'Primeiro Impacto' : last ? 'Chamada' : 'Desenvolvimento') + '</span></div>'
        + '<div><label class="input-label">Título na arte</label>'
        + '<input type="text" class="input-headline" data-act-input="texts-input" value="' + esc(p.headline || '') + '" data-field="headline"></div>'
        + '<div><label class="input-label">' + (story ? 'Pergunta e opções do Story' : 'Subtítulo na arte') + '</label>'
        + '<textarea class="input-body" data-act-input="texts-input" data-field="body" maxlength="180">' + esc(p.body || '') + '</textarea></div>'
        + '<input type="hidden" data-field="copy" value="' + esc(p.copy || '') + '">'
        + '<div><label class="input-label">Quem aparece na arte</label>'
        + '<select class="select-person" data-act-input="texts-input" data-field="person">'
        + personOptions.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === person ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('')
        + '</select></div>'
        + '</div>';
    }

    function claimsHtml(claims) {
      if (!claims || !claims.length) return '';
      return '<details class="claims-box"><summary>Fontes e afirmações (' + claims.length + ')</summary>'
        + claims.map(c => {
          const url = safeHttpUrl(c.sourceUrl);
          return '<div class="claim-item"><strong>' + esc(c.claim) + '</strong>'
            + (c.source ? '<div>Fonte: ' + esc(c.source) + '</div>' : '')
            + (url ? '<div><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a></div>' : '')
            + (c.qualification ? '<div style="color:var(--muted);">' + esc(c.qualification) + '</div>' : '')
            + '</div>';
        }).join('')
        + '</details>';
    }

    function stepTexts(ctx) {
      const review = activeProject.visualReview;
      const isApproved = textsApproved(activeProject);
      const pages = (review && review.pages) || [];
      const blocking = (review && review.blocking) || [];
      let html = stepHeadHtml(ctx, 'Textos', 'Revisão Editorial das Páginas', 'Edite título, subtítulo e quem aparece em cada slide. A legenda da publicação é uma só e aparece depois que as imagens forem geradas. É obrigatório aprovar os textos antes de gerar as imagens.');
      if (activeProject.formatAdaptation) {
        html += stepAlertHtml('info', '<strong>Adaptando os textos.</strong> O formato do projeto mudou; revise os textos depois que a adaptação terminar.');
      } else if (isApproved) {
        html += stepAlertHtml('success', '<strong>Textos aprovados!</strong> A etapa de imagens está liberada para produção.');
      } else {
        html += stepAlertHtml('warning', '<strong>Aprovação pendente.</strong> Revise os textos e use o botão abaixo para aprovar e continuar.');
      }
      if (blocking.length) {
        html += stepAlertHtml('error', '<strong>Ajustes necessários:</strong><ul style="margin-left:16px;margin-top:4px;font-size:12px;">' + blocking.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>');
      }
      if (pages.length === 0) {
        html += '<div class="card" style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">Nenhum texto preparado ainda. Use o botão abaixo para preparar os textos.</div>';
      } else {
        html += '<div class="page-cards-list">' + pages.map(p => textPageCardHtml(p, pages.length)).join('') + '</div>'
          + '<button type="button" class="btn-sm btn-secondary btn-touch" style="margin-top:12px;width:100%;" data-act="save-texts"' + (ctx.isRunning ? ' disabled' : '') + '>Salvar alterações</button>';
      }
      html += claimsHtml(review && review.claims);
      html += captionBoxHtml(activeProject.caption, 'É uma só para a publicação inteira. Copie para postar.');
      return html;
    }
    registerAction('texts-input', () => window.refreshAdvance());
    registerAction('save-texts', async () => {
      if (await window.saveVisualTexts()) toast('Textos salvos.');
    });

    // ---- Imagens ----
    function imageStateAlertHtml(g, p) {
      const n = g.items.length;
      switch (g.state) {
        case 'generating':
          return stepAlertHtml('info', '<strong>Gerando as imagens…</strong> ' + esc(g.statusMessage || 'Isso pode levar vários minutos.') + ' <a href="#" data-act="goto-tab" data-tab="live" style="color:var(--accent);font-weight:600;">Ver no terminal</a>');
        case 'failed':
          return stepAlertHtml('error', '<strong>A rodada não ficou pronta.</strong> ' + esc(g.statusMessage || 'A última rodada está incompleta. Gere as imagens novamente.'));
        case 'legacyNoStatus':
          return stepAlertHtml('warning', 'Esta versão antiga não tem comprovação de processamento completo. Gere as imagens novamente para prepará-la.');
        case 'importedPending':
          return stepAlertHtml('info', '<strong>Rodada importada.</strong> Os originais ainda precisam ser preparados com a identidade da marca.');
        case 'legacyFlat':
          return stepAlertHtml('info', 'Estas são as imagens de uma versão anterior do projeto (arquivos soltos). Gere as imagens para criar uma rodada nova e poder revisá-las.');
        case 'ready':
          return g.stale
            ? stepAlertHtml('warning', '<strong>Formato diferente.</strong> Estas imagens foram geradas em outro formato que o escolhido no projeto. Gere de novo para usar o formato atual.')
            : stepAlertHtml('success', '<strong>Rodada de imagens pronta!</strong> ' + n + ' ' + (n === 1 ? 'arte disponível' : 'artes disponíveis') + ' para revisão.');
        default:
          return stepAlertHtml('info', 'Nenhuma imagem gerada ainda.' + (textsApproved(p) ? ' Ao gerar, a IA cria as artes; isso pode levar vários minutos.' : ''));
      }
    }

    function stepImages(ctx) {
      const p = activeProject;
      const g = galleryOf(p);
      const n = g.items.length;
      const textsOk = textsApproved(p);
      let html = stepHeadHtml(ctx, 'Gerar Imagens', 'Geração Visual das Artes', 'Produção dos originais de cada slide e conformação de identidade da marca.');
      html += imageStateAlertHtml(g, p);
      if (!textsOk && ['none', 'failed', 'legacyFlat', 'legacyNoStatus'].includes(g.state)) {
        html += stepAlertHtml('warning', '<strong>Aprovação necessária:</strong> os textos precisam ser revisados e aprovados antes de gerar as artes.' + goToStepButtonHtml('texts', 'Ir para Textos'));
      }
      if (!p.brandId) {
        html += stepAlertHtml('warning', '<strong>Sem marca.</strong> Gerar imagens exige uma marca com logo oficial PNG.' + goToStepButtonHtml('brief', 'Escolher a marca na Pauta'));
      }
      if (p.format) html += '<div class="mdc-hint" style="margin-top:8px;">Formato: ' + esc(formatLabel(p.format)) + '</div>';
      if (n > 0) {
        html += '<div class="mdc-section-title">Prévia das artes · ' + n + '</div>'
          + carouselStripHtml(g.items, { src: 'gallery', label: 'Prévia das artes' })
          + '<div class="mdc-hint">Toque em uma arte para ampliar e deslizar entre as páginas.</div>';
      }
      if (g.state === 'ready' && textsOk && !ctx.isRunning) {
        html += '<button type="button" class="btn-link-secondary btn-touch" data-act="regen-images">Regerar a rodada inteira</button>';
      }
      return html;
    }
    registerAction('regen-images', () => window.generateImages());

    // ---- Revisão ----
    function reviewableItems() {
      const g = galleryOf(activeProject);
      return g.source === 'latest-batch' && g.state === 'ready' ? g.items : [];
    }
    function reviewEditable() {
      return Boolean(activeProject) && !activeProject.isRunning && reviewableItems().length > 0;
    }
    function reviewBlockMessage() {
      const g = galleryOf(activeProject);
      if (activeProject.isRunning) return 'Há um processo em andamento. Acompanhe-o antes de revisar.';
      if (g.source !== 'latest-batch') return 'Gere as imagens antes de revisar.';
      if (g.state === 'legacyNoStatus') return 'Esta versão antiga não tem comprovação de processamento completo. Gere as imagens novamente para prepará-la.';
      if (g.state === 'importedPending') return 'As imagens importadas ainda precisam ser preparadas na etapa Imagens.';
      if (g.state !== 'ready') return g.statusMessage || 'Aguarde a rodada ficar pronta para revisar.';
      return '';
    }
    function decisionChipHtml(a) {
      return a.approved ? '<span class="review-item-status decision-chip is-kept">Aprovada</span>'
        : a.redo ? '<span class="review-item-status decision-chip is-redo">Revisão solicitada</span>'
          : '<span class="review-item-status decision-chip is-pending">Pendente</span>';
    }

    // Controles de decisão de uma imagem (grade e visualizador): idx indexa gallery.items; nada de caminho em atributo.
    function decisionControlsHtml(a, idx, isRunning) {
      const drafting = revisionDrafts[a.path] !== undefined;
      const redoOn = Boolean(a.redo && !a.approved);
      const dis = isRunning ? ' disabled' : '';
      const n = idx + 1;
      let html = '<div class="decision-box"><div class="review-action-btn-group">'
        + '<button type="button" class="btn-review-keep' + (a.approved ? ' active' : '') + '" aria-pressed="' + (a.approved ? 'true' : 'false') + '" aria-label="Aprovar imagem ' + n + '"' + dis + ' data-act="asset-approve" data-index="' + idx + '">' + (a.approved ? '✓ Aprovada' : 'Aprovar') + '</button>'
        + '<button type="button" class="btn-review-redo' + (drafting || redoOn ? ' active' : '') + '" aria-pressed="' + (drafting || redoOn ? 'true' : 'false') + '" aria-label="Pedir revisão da imagem ' + n + '"' + dis + ' data-act="asset-revise" data-index="' + idx + '">' + (drafting ? 'Pedindo revisão' : redoOn ? 'Revisão confirmada' : 'Pedir revisão') + '</button>'
        + '</div>';
      if (drafting) {
        html += '<textarea class="redo-note" rows="3" maxlength="1000" placeholder="O que deve mudar nesta imagem? (opcional)" aria-label="O que deve mudar na imagem ' + n + '" data-act-input="asset-note" data-index="' + idx + '"' + dis + '>' + esc(revisionDrafts[a.path]) + '</textarea>'
          + '<div class="review-action-btn-group">'
          + '<button type="button" class="btn-review-redo" data-act="asset-note-cancel" data-index="' + idx + '">Cancelar</button>'
          + '<button type="button" class="btn-review-keep active"' + dis + ' data-act="asset-note-confirm" data-index="' + idx + '">Confirmar revisão</button>'
          + '</div><div class="step-hint-text">O pedido só vale depois de confirmado.</div>';
      } else if (redoOn) {
        html += '<div class="step-hint-text"><strong>Revisão confirmada.</strong> ' + (a.redo.note ? esc('Pedido: ' + a.redo.note) : 'Sem observações.') + '</div>'
          + '<div class="review-action-btn-group"><button type="button" class="btn-review-redo"' + dis + ' data-act="asset-edit-note" data-index="' + idx + '">Editar revisão</button></div>';
      }
      if (!drafting && (a.approved || redoOn)) {
        html += '<button type="button" class="decision-clear"' + dis + ' data-act="asset-clear" data-index="' + idx + '">Limpar decisão</button>';
      }
      return html + '</div>';
    }

    function reviewFooterHtml(a, idx) {
      return decisionControlsHtml(a, idx, Boolean(activeProject && activeProject.isRunning));
    }

    function reviewCardHtml(a, i, total, editable, src) {
      return '<div class="review-item-card">'
        + '<button type="button" class="review-item-imgbtn" data-act="open-viewer" data-src="' + src + '" data-index="' + i + '" aria-label="Ampliar slide ' + (i + 1) + ' de ' + total + '">'
        + '<img src="' + esc(a.url) + '" class="review-item-img" alt="' + esc(a.name) + '" loading="lazy"></button>'
        + '<div class="review-item-meta"><div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">'
        + '<span style="font-size:12px;font-weight:700;">Slide ' + (i + 1) + '/' + total + '</span>' + (editable ? decisionChipHtml(a) : '') + '</div>'
        + (editable ? decisionControlsHtml(a, i, Boolean(activeProject.isRunning)) : '')
        + '</div></div>';
    }

    function stepReviewImage(ctx) {
      syncViewer();
      const p = activeProject;
      const g = galleryOf(p);
      const items = g.items;
      const ready = g.source === 'latest-batch' && g.state === 'ready';
      const editable = reviewEditable();
      const block = reviewBlockMessage();
      const counts = p.review || { kept: 0, redo: 0, pending: 0 };
      const allApproved = ready && items.length > 0 && items.every(a => a.approved);
      const hasRedo = ready && items.some(a => a.redo && !a.approved);
      let html = stepHeadHtml(ctx, 'Revisão', 'Revisar Imagem a Imagem', 'Aprove cada imagem ou peça revisão. As imagens com revisão solicitada são refeitas, só elas.');
      if (g.source === 'latest-batch') {
        html += '<div class="counter-row"><span class="counter-chip is-kept">' + counts.kept + ' para manter</span><span class="counter-chip is-redo">' + counts.redo + ' para refazer</span><span class="counter-chip">' + counts.pending + ' sem decisão</span></div>';
      }
      if (block) html += stepAlertHtml(g.state === 'failed' ? 'error' : 'info', esc(block));
      if (allApproved) html += stepAlertHtml('success', '<strong>Todas as imagens foram aprovadas!</strong> O pacote está pronto para entrega.');
      else if (hasRedo) html += stepAlertHtml('warning', 'Há imagens com revisão solicitada. Decida as demais e use o botão abaixo para gerar a nova versão só delas.');
      if (items.length === 0) {
        html += '<div class="card" style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">' + (g.source === 'none' ? 'Nenhuma imagem gerada para revisar. Volte e gere as imagens.' : 'A rodada de imagens ainda não tem artes para revisar.') + '</div>';
      } else {
        const src = ready ? 'review' : 'gallery';
        html += '<div class="review-grid" style="margin-top:10px;">' + items.map((a, i) => reviewCardHtml(a, i, items.length, editable, src)).join('') + '</div>';
        if (!ready) html += '<div class="mdc-hint" style="margin-top:8px;">Somente visualização: a revisão libera quando a rodada estiver pronta.</div>';
      }
      html += captionBoxHtml(p.caption, 'É uma só para a publicação inteira. Copie para postar.');
      return html;
    }

    let decisionBusy = false;
    // Revisões abertas e ainda não confirmadas: a nova versão só é liberada depois de confirmar ou cancelar cada uma.
    function openRevisionCount() {
      const items = reviewableItems();
      return Object.keys(revisionDrafts).filter(path => items.some(a => a.path === path)).length;
    }
    function rerenderReview(focusIndex) {
      renderActiveStep();
      syncViewer();
      if (focusIndex === undefined) return;
      const ta = document.querySelector('.vw-foot textarea.redo-note') || document.querySelector('#detailStepShell textarea.redo-note[data-index="' + focusIndex + '"]');
      if (ta && ta.focus) ta.focus();
    }
    function reviewItemAt(el) {
      return reviewableItems()[Number(el.dataset.index)];
    }
    async function sendAssetDecision(action, body) {
      if (!activeProject || decisionBusy) return false;
      decisionBusy = true;
      try {
        const data = await projectAction(action, body);
        if (!data) return false;
        await refreshActive({ keepEdits: false });
        syncViewer();
        return true;
      } finally {
        decisionBusy = false;
      }
    }

    // Aprovar alterna a aprovação; Pedir revisão só abre o rascunho (nada é salvo); só "Confirmar revisão" registra.
    registerAction('asset-approve', async (el) => {
      const a = reviewItemAt(el);
      if (!a || activeProject.isRunning) return;
      delete revisionDrafts[a.path];
      const ok = await sendAssetDecision('approve-asset', a.approved ? { path: a.path, approved: false } : { path: a.path });
      if (!ok) rerenderReview();
    });
    registerAction('asset-revise', async (el) => {
      const a = reviewItemAt(el);
      if (!a || activeProject.isRunning) return;
      const idx = Number(el.dataset.index);
      if (revisionDrafts[a.path] !== undefined) {
        delete revisionDrafts[a.path];
        rerenderReview();
      } else if (a.redo && !a.approved) {
        await sendAssetDecision('review-asset', { path: a.path, redo: false });
      } else {
        revisionDrafts[a.path] = (a.redo && a.redo.note) || '';
        rerenderReview(idx);
      }
    });
    registerAction('asset-note', (el) => {
      const a = reviewItemAt(el);
      if (a) revisionDrafts[a.path] = el.value;
    });
    registerAction('asset-note-cancel', (el) => {
      const a = reviewItemAt(el);
      if (!a) return;
      delete revisionDrafts[a.path];
      rerenderReview();
    });
    registerAction('asset-edit-note', (el) => {
      const a = reviewItemAt(el);
      if (!a) return;
      revisionDrafts[a.path] = (a.redo && a.redo.note) || '';
      rerenderReview(Number(el.dataset.index));
    });
    registerAction('asset-note-confirm', async (el) => {
      const a = reviewItemAt(el);
      if (!a || activeProject.isRunning) return;
      const note = (revisionDrafts[a.path] || '').trim();
      delete revisionDrafts[a.path];
      const ok = await sendAssetDecision('review-asset', { path: a.path, redo: true, note });
      if (!ok) {
        revisionDrafts[a.path] = note;
        rerenderReview();
      }
    });
    registerAction('asset-clear', async (el) => {
      const a = reviewItemAt(el);
      if (!a || activeProject.isRunning) return;
      delete revisionDrafts[a.path];
      const ok = await sendAssetDecision(
        a.redo && !a.approved ? 'review-asset' : 'approve-asset',
        a.redo && !a.approved ? { path: a.path, redo: false } : { path: a.path, approved: false },
      );
      if (!ok) rerenderReview();
    });

    // ---- Entrega ----
    function exportImageItems() {
      const approved = (activeProject && activeProject.delivery && activeProject.delivery.approved) || [];
      return approved.filter(a => a.kind === 'image').sort((x, y) => x.name.localeCompare(y.name));
    }
    function deliverRowHtml(a, imageIndex) {
      const thumb = a.kind === 'image' && imageIndex >= 0
        ? '<button type="button" class="deliver-thumb" style="border:0;padding:0;" data-act="open-viewer" data-src="export" data-index="' + imageIndex + '" aria-label="Ampliar ' + esc(a.name) + '">' + thumbMediaHtml(a) + '</button>'
        : '<div class="deliver-thumb">' + thumbMediaHtml(a) + '</div>';
      return '<div class="deliver-row">' + thumb + '<span class="deliver-name" title="' + esc(a.name) + '">' + esc(baseName(a.name)) + '</span>' + downloadLinkHtml(a, 'Baixar') + '</div>';
    }

    function stepExportImage(ctx) {
      const d = activeProject.delivery || { approved: [], total: 0, files: {}, zipUrl: null };
      const approved = d.approved || [];
      const images = exportImageItems();
      let html = stepHeadHtml(ctx, 'Entregar', 'Conteúdo Pronto para Publicação', 'Os arquivos aprovados estão abaixo com links diretos para baixar no seu celular.');
      html += '<div class="counter-row"><span class="counter-chip is-kept">' + approved.length + ' de ' + (d.total || 0) + ' arquivos aprovados</span></div>';
      html += captionBoxHtml(activeProject.caption, 'Copie a legenda para postar junto das imagens.');
      if (approved.length === 0) {
        html += '<div class="card" style="text-align:center;padding:20px;margin-top:12px;color:var(--muted);font-size:13px;">Nenhum arquivo aprovado ainda para entrega. Aprove as imagens na etapa Revisão.' + goToStepButtonHtml('review', 'Ir para a Revisão') + '</div>';
      }
      if (d.zipUrl) {
        html += '<a class="btn-sm btn-accent btn-touch" style="margin-top:14px;width:100%;" href="' + esc(d.zipUrl) + '" download>Baixar ZIP (' + approved.length + ' ' + (approved.length === 1 ? 'arquivo' : 'arquivos') + ')</a>';
      } else {
        html += '<button type="button" class="btn-sm btn-accent btn-touch" style="margin-top:14px;width:100%;" disabled aria-disabled="true">Baixar ZIP</button>'
          + '<div class="mdc-hint" style="margin-top:6px;">O pacote só fica disponível depois de aprovar ao menos um arquivo.</div>';
      }
      if (images.length) {
        html += '<div class="mdc-section-title">Imagens aprovadas · ' + images.length + '</div>'
          + carouselStripHtml(images, { src: 'export', label: 'Imagens aprovadas' });
      }
      if (approved.length) {
        html += '<div class="mdc-section-title">Arquivos</div><div style="display:flex;flex-direction:column;gap:8px;">'
          + approved.map(a => deliverRowHtml(a, a.kind === 'image' ? images.findIndex(x => x.path === a.path) : -1)).join('') + '</div>';
      }
      return html;
    }

    // ---- Ações ----
    window.saveBrief = async () => {
      if (!activeProject) return false;
      const el = document.getElementById('editBriefTopic');
      const brief = el ? el.value.trim() : (activeProject.brief || '').trim();
      if (!brief) {
        toast('Escreva a pauta antes de salvar.', 'error');
        return false;
      }
      const data = await projectAction('update-brief', { brief });
      if (!data) return false;
      await refreshActive({ keepEdits: false });
      toast('Pauta salva.');
      return true;
    };

    // Imagem: prepara os textos; vídeo: pede o roteiro ao agente. Ambos pedem confirmação de custo em projectAction.
    window.prepareStepContent = async () => {
      if (!activeProject) return;
      const isImg = activeProject.kind === 'image';
      if (!isImg && briefDirty() && !(await window.saveBrief())) return;
      const data = await projectAction(isImg ? 'prepare-texts' : 'start-agent');
      if (data) switchTab('live');
    };

    function readTextPages() {
      const pages = [];
      document.querySelectorAll('.page-card').forEach(card => {
        pages.push({
          page: Number(card.dataset.page),
          headline: card.querySelector('[data-field="headline"]').value.trim(),
          body: card.querySelector('[data-field="body"]').value.trim(),
          copy: card.querySelector('[data-field="copy"]').value.trim(),
          depictedPerson: card.querySelector('[data-field="person"]').value,
        });
      });
      return pages;
    }

    function textsDirty() {
      const saved = (activeProject.visualReview && activeProject.visualReview.pages) || [];
      return readTextPages().some(p => {
        const s = saved.find(x => x.page === p.page);
        return !s || (s.headline || '').trim() !== p.headline || (s.body || '').trim() !== p.body || (s.copy || '').trim() !== p.copy || (s.depictedPerson || 'none') !== p.depictedPerson;
      });
    }

    window.saveVisualTexts = async () => {
      if (!activeProject) return false;
      const pages = readTextPages();
      if (!pages.length) return false;
      const data = await projectAction('save-visual', { pages });
      if (!data) return false;
      await refreshActive({ keepEdits: false });
      return true;
    };

    window.approveVisualTexts = async () => {
      if (!activeProject || !activeProject.visualReview) return;
      const data = await projectAction('approve-visual', { contentHash: activeProject.visualReview.contentHash });
      if (data) await window.openProjectDetail(activeProject.id, 'images');
    };

    window.generateImages = async () => {
      const data = await projectAction('generate-images');
      if (data) switchTab('live');
    };

    window.reviseImages = async () => {
      const data = await projectAction('revise-images');
      if (data) switchTab('live');
    };

    window.preparePostnow = async () => {
      const g = galleryOf(activeProject);
      if (!g.batchId) return;
      const data = await projectAction('render', { batchId: g.batchId }, { cost: 'Preparar as imagens importadas usa o processamento do computador e pode demorar. Continuar?' });
      if (data) switchTab('live');
    };

    // Rascunhos de revisão e edições de pauta/textos seguram a atualização automática do detalhe.
    registerDirtyCheck(() => {
      if (!activeProject) return false;
      if (viewer && Object.keys(revisionDrafts).length > 0) return true;
      const step = activeProject.journey && activeProject.journey.steps && activeProject.journey.steps[activeStepIndex];
      if (!step) return false;
      if (step.id === 'brief') return briefDirty();
      if (step.id === 'texts' && activeProject.kind === 'image') return textsDirty();
      return false;
    });

    // O botão único de avanço de uma etapa de imagem: ação do servidor (footerActions), promovida a "salvar primeiro" quando os campos foram editados aqui.
    function computeAdvance(stepId) {
      if (!activeProject || activeProject.kind !== 'image') return null;
      if (stepId === 'review' && openRevisionCount() > 0) return { kind: 'wait', label: 'Confirme ou cancele a revisão', enabled: false, hint: 'Toque em “Confirmar revisão” na imagem para registrar o pedido. A nova versão só é liberada depois disso.' };
      const action = activeProject.footerActions && activeProject.footerActions[stepId];
      if (!action) return null;
      if (stepId === 'brief') {
        const topicEl = document.getElementById('editBriefTopic');
        if (topicEl) {
          const field = topicEl.value.trim();
          if (!field) return { kind: 'wait', label: 'Escreva a pauta para continuar', enabled: false };
          if (field !== (activeProject.brief || '').trim()) return { kind: 'save-brief', label: 'Salvar e continuar', enabled: true };
        }
      } else if (stepId === 'texts') {
        const review = activeProject.visualReview;
        const promotable = action.kind === 'continue' || action.kind === 'approve-texts' || action.kind === 'save-approve-texts'
          || (action.kind === 'wait' && review && (review.blocking || []).length > 0 && !activeProject.isRunning && !activeProject.formatAdaptation);
        if (promotable && document.querySelector('.page-card') && textsDirty()) return { kind: 'save-approve-texts', label: 'Salvar, aprovar e continuar', enabled: true };
      } else if (stepId === 'images' && (action.kind === 'generate' || action.kind === 'regenerate') && !action.enabled && textsApproved(activeProject)) {
        // Textos aprovados e o botão ainda desabilitado: falta marca com logo oficial.
        return Object.assign({}, action, { hint: 'Vincule ao projeto uma marca com logo oficial PNG (etapa Pauta) para gerar as imagens.' });
      }
      return action;
    }

    let imageAdvanceBusy = false;

    window.refreshAdvance = () => {
      const btn = document.getElementById('stepAdvanceBtn');
      if (!btn || !activeProject) return;
      const steps = (activeProject.journey && activeProject.journey.steps) || [];
      const stepId = steps[activeStepIndex] && steps[activeStepIndex].id;
      const action = activeProject.kind === 'image' ? computeAdvance(stepId) : computeVideoAdvance(stepId);
      if (!action) return;
      btn.textContent = imageAdvanceBusy ? 'Aguarde…' : action.label;
      btn.disabled = imageAdvanceBusy || !action.enabled;
      const hint = document.getElementById('stepAdvanceHint');
      if (hint) {
        hint.textContent = action.hint || '';
        hint.style.display = action.hint ? '' : 'none';
      }
    };

    window.advanceStep = async () => {
      if (!activeProject || imageAdvanceBusy) return;
      const steps = (activeProject.journey && activeProject.journey.steps) || [];
      const stepId = steps[activeStepIndex] && steps[activeStepIndex].id;
      const action = computeAdvance(stepId);
      if (!action || !action.enabled) return;
      imageAdvanceBusy = true;
      window.refreshAdvance();
      try {
        switch (action.kind) {
          case 'save-brief':
            if (await window.saveBrief()) window.nextStep();
            break;
          case 'continue':
          case 'go-review':
          case 'deliver':
            window.nextStep();
            break;
          case 'prepare-texts':
            await window.prepareStepContent();
            break;
          case 'approve-texts':
            await window.approveVisualTexts();
            break;
          case 'save-approve-texts':
            if (await window.saveVisualTexts()) {
              if (activeProject.visualReview && activeProject.visualReview.ready) await window.approveVisualTexts();
              else toast('Textos salvos, mas ainda há itens pendentes antes de aprovar.');
            }
            break;
          case 'generate':
          case 'regenerate':
            await window.generateImages();
            break;
          case 'prepare-postnow':
            await window.preparePostnow();
            break;
          case 'revise':
            await window.reviseImages();
            break;
        }
      } finally {
        imageAdvanceBusy = false;
        window.refreshAdvance();
      }
    };

`;
