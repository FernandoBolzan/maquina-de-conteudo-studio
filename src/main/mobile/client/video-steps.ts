// Etapas de vídeo: roteiro, narração, render, revisão, entrega e rodapé.
// Só lê o que o servidor calcula (activeProject.video / scenes / delivery / footerActions); no celular não há geração de narração.
export const SCRIPT_VIDEO_STEPS = `    // ---- Etapas de vídeo ------------------------------------------------------------
    let vsActing = false;
    let vsAdvanceBusy = false;
    const VS_REVISION_KEY = '__video-revision__';
    const VS_COPY_CACHE = new Map();
    const VS_COPY_LOADING = new Set();

    async function vsGuard(work) {
      if (vsActing) return undefined;
      vsActing = true;
      try {
        return await work();
      } finally {
        vsActing = false;
      }
    }

    function vsStepIndex(stepId) {
      const steps = (activeProject && activeProject.journey && activeProject.journey.steps) || [];
      return steps.findIndex((s) => s.id === stepId);
    }

    function vsNextStepId() {
      const steps = (activeProject && activeProject.journey && activeProject.journey.steps) || [];
      const next = steps[activeStepIndex + 1];
      return next ? next.id : undefined;
    }

    function vsGoStep(stepId) {
      const idx = vsStepIndex(stepId);
      if (idx >= 0) {
        selectStep(idx);
        scrollToY(0);
      }
    }

    function vsDownloadUrl(url) {
      return String(url) + (String(url).indexOf('?') >= 0 ? '&' : '?') + 'download=1';
    }

    function vsHeader(ctx, label, title, desc) {
      return '<div class="step-eyebrow">Etapa ' + (activeStepIndex + 1) + ' de ' + ctx.totalSteps + ' · ' + esc(label) + '</div>'
        + '<div class="step-shell-title">' + esc(title) + '</div>'
        + '<p class="step-shell-desc">' + esc(desc) + '</p>'
        + ctx.runningBanner;
    }

    // inner já vem escapado por quem chama.
    function vsAlert(kind, inner) {
      return '<div class="step-alert ' + kind + '" role="' + (kind === 'warning' || kind === 'error' ? 'alert' : 'status') + '" style="margin-top: 10px;"><div>' + inner + '</div></div>';
    }

    function vsTitled(title, text) {
      return '<strong>' + esc(title) + '</strong>' + (text ? ' ' + esc(text) : '');
    }

    function vsEmpty(text) {
      return '<div class="card" style="text-align: center; padding: 20px; color: var(--muted); font-size: 13px; margin-top: 10px;">' + esc(text) + '</div>';
    }

    function vsNote(text) {
      return '<p class="step-hint-text" style="text-align: left; margin-top: 6px;">' + esc(text) + '</p>';
    }

    function vsButton(act, label, opts) {
      const o = opts || {};
      let data = '';
      if (o.data) {
        Object.keys(o.data).forEach((k) => { data += ' data-' + k + '="' + esc(o.data[k]) + '"'; });
      }
      const cls = o.secondary ? 'btn-sm btn-secondary' : 'btn-primary';
      const style = o.secondary ? 'width: 100%; margin-top: 8px;' : 'margin-top: 10px;';
      return '<button type="button" class="' + cls + '" style="' + style + '" data-act="' + esc(act) + '"' + data + (o.disabled ? ' disabled' : '') + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' + esc(label) + '</button>';
    }

    function vsPlayer(asset, poster) {
      if (!asset || !asset.url) return '';
      return '<div style="margin-top: 10px; border-radius: 10px; overflow: hidden; background: #000;">'
        + '<video controls playsinline preload="metadata" src="' + esc(asset.url) + '"' + (poster ? ' poster="' + esc(poster) + '"' : '') + ' style="width: 100%; max-height: 70vh; display: block;"></video>'
        + '</div>'
        + '<div class="scene-meta" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px;">'
        + '<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + esc(asset.name) + '">' + esc(asset.name) + '</span>'
        + '<a href="' + esc(vsDownloadUrl(asset.url)) + '" download="' + esc(asset.name) + '" style="color: var(--accent); font-weight: 600; white-space: nowrap;">Baixar</a>'
        + '</div>';
    }

    function vsPreviousHtml(list) {
      if (!list || list.length === 0) return '';
      return '<div class="section-title" style="margin-top: 16px; margin-bottom: 8px;">Versões anteriores</div>'
        + list.map((a) => '<details class="card" style="padding: 10px 12px; margin-bottom: 8px;">'
          + '<summary style="cursor: pointer; font-size: 13px;"><strong>' + esc(a.name) + '</strong><br><span class="scene-meta">Versão anterior — não bloqueia a entrega.</span></summary>'
          + '<div style="margin-top: 8px; border-radius: 8px; overflow: hidden; background: #000;"><video controls playsinline preload="none" src="' + esc(a.url) + '" style="width: 100%; max-height: 60vh; display: block;"></video></div>'
          + '<div class="scene-meta" style="margin-top: 6px;"><a href="' + esc(vsDownloadUrl(a.url)) + '" download="' + esc(a.name) + '" style="color: var(--accent); font-weight: 600;">Baixar</a></div>'
          + '</details>').join('');
    }

    function vsSceneTitle(scene, idx) {
      return 'Cena ' + (idx + 1) + ': ' + esc(scene.title || 'Cena');
    }

    function vsSceneLine(label, text) {
      return '<div class="scene-meta"><strong>' + esc(label) + ':</strong> ' + esc(text) + '</div>';
    }

    // ---- Roteiro ----
    function stepScript(ctx) {
      const { isRunning } = ctx;
      const video = activeProject.video;
      const narrationScenes = (video && video.narration && video.narration.scenes) || [];
      const storyboard = activeProject.scenes || [];
      const scenes = storyboard.length > 0 ? storyboard : narrationScenes;
      const byId = new Map(narrationScenes.map((s) => [s.id, s]));
      const ready = video ? video.storyboardReady : Boolean(activeProject.storyboardReady);
      const issues = (video && video.storyboardIssues) || [];
      const hasBrief = Boolean(String(activeProject.brief || '').trim());

      let html = vsHeader(ctx, 'Roteiro do Vídeo', 'Cenas e Direção do Storyboard', 'Revise a estrutura de cenas e falas antes de renderizar o vídeo no VideoGo. A edição das cenas é feita no computador.');

      if (scenes.length === 0) {
        html += '<div class="card" style="text-align: center; padding: 20px; color: var(--muted); font-size: 13px; margin-top: 10px;">Roteiro ainda não foi gerado.'
          + vsButton('video-prepare-script', 'Preparar roteiro', { disabled: isRunning || !hasBrief })
          + (hasBrief ? '' : '<p class="step-hint-text" style="margin-top: 8px;">Descreva o vídeo na etapa Pauta para preparar o roteiro.</p>')
          + '</div>';
        return html;
      }

      html += ready
        ? vsAlert('success', vsTitled('Roteiro aprovado!', 'A narração e a renderização estão liberadas.'))
        : vsAlert('info', 'Revise as cenas abaixo e toque em <em>Aprovar roteiro</em> para avançar.');
      if (issues.length > 0) {
        html += vsAlert('warning', '<strong>Pendências no roteiro:</strong><ul style="margin: 4px 0 0 16px; font-size: 12px;">' + issues.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>');
      }

      html += '<div class="page-cards-list" style="margin-top: 10px;">' + scenes.map((s, idx) => {
        const n = byId.get(s.id);
        const spoken = n ? String(n.spokenText || '') : '';
        const narration = n ? String(n.narration || '') : '';
        const onScreen = typeof s.onScreen === 'string' ? s.onScreen : '';
        return '<div class="scene-card">'
          + '<div class="scene-header"><span>' + vsSceneTitle(s, idx) + '</span></div>'
          + (onScreen ? vsSceneLine('Texto na tela', onScreen) : '')
          + (narration ? vsSceneLine('Narração', narration) : '')
          + (spoken && spoken !== narration ? vsSceneLine('Fala (pronúncia)', spoken) : '')
          + '</div>';
      }).join('') + '</div>';

      if (!ready) {
        const hint = issues.length > 0 ? 'O VideoGo pode recusar: ' + issues.length + (issues.length === 1 ? ' pendência.' : ' pendências.') : '';
        html += vsButton('video-approve-script', 'Aprovar roteiro', { disabled: isRunning }) + (hint ? vsNote(hint) : '');
      }
      return html;
    }

    // ---- Narração ----
    function stepVoice(ctx) {
      const { isRunning } = ctx;
      const video = activeProject.video;
      const nar = video && video.narration;
      let html = vsHeader(ctx, 'Narração e Voz', 'Locução e Síntese de Voz', 'Acompanhe e aprove os áudios das cenas. Gerar, gravar ou enviar áudio é feito no computador.');
      if (!video || !nar) return html + vsEmpty('Narração indisponível para este projeto.');

      const silent = video.mode === 'silent';
      const list = nar.scenes || [];
      const missing = list.filter((s) => !s.audioUrl && !s.stray && String(s.narration || '').trim()).length;
      const stray = list.filter((s) => s.stray).length;
      const pending = list.filter((s) => s.audioUrl && !s.audioApproved).length;
      const plural = (n, one, many) => (n === 1 ? one : many);

      html += '<div style="margin-top: 10px;"><span class="tag">' + (silent ? 'Sem narração' : 'Narrado') + '</span></div>';

      if (!silent && nar.needsKey) {
        html += vsAlert('warning', vsTitled('ElevenLabs sem chave:', 'envie ou grave o áudio no computador.'));
      }

      if (silent) {
        html += vsAlert('info', 'Este vídeo segue <strong>sem narração</strong>. Você pode continuar para a renderização.');
      } else if (missing > 0 || stray > 0) {
        let detail = '';
        if (missing > 0) detail += '<li>Falta áudio em ' + missing + ' ' + plural(missing, 'cena', 'cenas') + '.</li>';
        if (stray > 0) detail += '<li>Há áudio órfão em ' + stray + ' ' + plural(stray, 'cena', 'cenas') + ': remova ou substitua no computador.</li>';
        html += vsAlert('warning', vsTitled('Gere ou envie o áudio no computador') + '<ul style="margin: 4px 0 0 16px; font-size: 12px;">' + detail + '</ul>');
      } else if (pending > 0) {
        html += vsAlert('info', pending + ' ' + plural(pending, 'áudio aguardando aprovação.', 'áudios aguardando aprovação.') + ' Ouça cada cena abaixo antes de aprovar.');
        html += vsButton('video-approve-audio', 'Aprovar áudios', { disabled: isRunning });
      } else if (nar.blocked) {
        html += vsAlert('warning', vsTitled('Gere ou envie o áudio no computador', 'A narração ainda não está pronta.'));
      } else {
        html += vsAlert('success', vsTitled('Narração pronta!', 'Todos os áudios estão aprovados.'));
      }

      if (!video.storyboardReady) {
        html += vsAlert('warning', vsTitled('Roteiro ainda não aprovado.', 'A narração só avança depois do roteiro aprovado.'))
          + vsButton('video-goto-step', 'Voltar ao roteiro', { secondary: true, data: { step: 'script' } });
      } else if (silent || (!nar.blocked && pending === 0)) {
        html += vsButton('next-step', 'Avançar para Renderização →');
      }

      if (list.length === 0) {
        html += vsEmpty('Nenhuma cena com narração ainda.');
        return html;
      }
      html += '<div class="page-cards-list" style="margin-top: 12px;">' + list.map((s, idx) => {
        const narration = String(s.narration || '');
        const spoken = String(s.spokenText || '');
        let badge = '';
        if (!silent) {
          const label = s.stray ? 'Áudio órfão' : s.audioUrl ? (s.audioApproved ? 'Aprovado' : 'Aguardando aprovação') : 'Sem áudio';
          const color = s.stray ? '#fbbf24' : s.audioUrl && s.audioApproved ? '#34d399' : 'var(--muted)';
          badge = '<span class="page-card-badge" style="color: ' + color + ';">' + label + '</span>';
        }
        return '<div class="scene-card">'
          + '<div class="scene-header"><span>' + vsSceneTitle(s, idx) + '</span>' + badge + '</div>'
          + (s.onScreen ? vsSceneLine('Texto na tela', s.onScreen) : '')
          + vsSceneLine('Narração', narration || '-')
          + (spoken && spoken !== narration ? vsSceneLine('Fala (pronúncia)', spoken) : '')
          + (!silent && s.audioUrl ? '<audio controls preload="metadata" src="' + esc(s.audioUrl) + '" style="width: 100%;"></audio>' : '')
          + (!silent && s.stray ? '<div class="scene-meta" style="color: #fbbf24;">Este áudio não pertence mais ao texto da cena. Remova ou substitua no computador.</div>' : '')
          + '</div>';
      }).join('') + '</div>';
      return html;
    }

    // ---- Render ----
    function vsRenderBlock(video, isRunning) {
      const footer = activeProject.footerActions && activeProject.footerActions.render;
      const audioBlocked = video.mode === 'narrated' && video.audioCheckUnavailable;
      let reason = '';
      if (isRunning) reason = 'Aguarde o processo terminar.';
      else if (video.narration && video.narration.blocked) reason = 'Volte à narração: ela ainda não está pronta.';
      else if (audioBlocked) reason = 'Não foi possível verificar o áudio do vídeo. Instale o FFprobe no computador e tente de novo.';
      else if (!video.storyboardReady) reason = footer && footer.kind === 'approve-render' ? 'Aprove o roteiro para renderizar: use o botão Aprovar roteiro e renderizar, abaixo.' : 'Aprove o roteiro na etapa Roteiro para renderizar.';
      return { disabled: Boolean(reason), reason };
    }

    function stepRender(ctx) {
      const { isRunning } = ctx;
      const video = activeProject.video;
      let html = vsHeader(ctx, 'Renderizar Vídeo', 'Renderização com VideoGo', 'Composição procedural de tipografia, motion, imagens da marca e sonoplastia. A renderização usa o processamento do computador.');
      if (!video) return html + vsEmpty('Dados de vídeo indisponíveis para este projeto.');

      if (video.basicPostVideo) {
        html += vsAlert('warning', vsTitled('Vídeo com movimento básico.', 'Este vídeo ainda usa as artes do post. Para um resultado melhor, produza o roteiro com IA no computador.'));
      }
      if (video.mode === 'narrated' && video.audioCheckUnavailable) {
        html += vsAlert('warning', vsTitled('Não foi possível verificar o áudio.', 'Instale o FFprobe no computador e tente de novo.'));
      }

      if (video.latest) {
        html += vsAlert('success', vsTitled('Vídeo renderizado!', 'Confira a reprodução abaixo.'));
        if (!video.storyboardReady) {
          html += vsAlert('warning', vsTitled('Vídeo possivelmente desatualizado.', 'Aprove o roteiro e renderize a versão atualizada antes de entregar.'));
        }
        html += vsPlayer(video.latest, video.poster);
      } else if (video.emptyReason) {
        html += vsEmpty(video.emptyReason);
      }

      const block = vsRenderBlock(video, isRunning);
      html += vsButton('video-render', video.latest ? 'Renderizar nova versão do vídeo' : 'Renderizar vídeo', { disabled: block.disabled });
      if (block.reason) html += vsNote(block.reason);
      html += vsPreviousHtml(video.previous);
      return html;
    }

    // ---- Revisão ----
    function stepReviewVideo(ctx) {
      const { isRunning } = ctx;
      const video = activeProject.video;
      let html = vsHeader(ctx, 'Revisão do Vídeo', 'Aprovar Vídeo Final', 'Assista ao vídeo e confirme a aprovação ou peça uma revisão antes da entrega.');
      if (!video) return html + vsEmpty('Dados de vídeo indisponíveis para este projeto.');
      const latest = video.latest;
      const scriptBtn = vsButton('video-goto-step', 'Ver roteiro', { secondary: true, data: { step: 'script' } });

      if (!latest) {
        return html + vsEmpty(video.emptyReason || 'Nenhum vídeo renderizado para revisar.') + vsPreviousHtml(video.previous);
      }

      if (!video.storyboardReady) {
        html += vsAlert('warning', vsTitled('Vídeo possivelmente desatualizado.', 'Aprove o roteiro e renderize a versão atualizada antes de entregar.'));
      }
      html += vsPlayer(latest, video.poster);
      html += '<p class="step-hint-text" style="text-align: left; margin-top: 6px;">' + esc(latest.approved ? 'Aprovado para exportação.' : 'Assista ao vídeo e decida: aprovar ou pedir revisão.') + '</p>';

      const approveDisabled = isRunning || !video.storyboardReady;
      html += latest.approved
        ? '<button type="button" class="btn-primary" style="margin-top: 10px; background: var(--success);" data-act="video-approve"' + (approveDisabled ? ' disabled' : '') + '>✓ Aprovado — toque para desfazer</button>'
        : vsButton('video-approve', 'Aprovar vídeo', { disabled: approveDisabled });

      const open = revisionDrafts[VS_REVISION_KEY] !== undefined;
      html += '<button type="button" class="btn-sm btn-secondary" style="width: 100%; margin-top: 8px;" data-act="video-revision-toggle" aria-expanded="' + (open ? 'true' : 'false') + '"' + (isRunning ? ' disabled' : '') + '>' + (open ? 'Cancelar pedido de revisão' : 'Pedir revisão') + '</button>';
      if (open) {
        const draft = String(revisionDrafts[VS_REVISION_KEY] || '');
        html += '<div class="form-group" style="margin-top: 10px;">'
          + '<label class="input-label" for="videoRevisionNote">O que mudar no vídeo?</label>'
          + '<textarea id="videoRevisionNote" class="form-control" rows="4" data-act-input="video-revision-input" placeholder="Ex.: o gancho está lento; deixe a palavra filhos em destaque; troque a transição da cena 3.">' + esc(draft) + '</textarea>'
          + '<p class="step-hint-text" style="text-align: left; margin-top: 6px;">O Claude altera o roteiro e a animação conforme o pedido. Depois, renderize de novo para ver a nova versão; o vídeo atual continua disponível para comparação. A narração já gerada não é refeita. Este pedido aciona o agente de IA e consome créditos.</p>'
          + vsButton('video-revision-send', 'Enviar pedido', { id: 'videoRevisionSend', disabled: isRunning || !draft.trim() })
          + '</div>';
      }

      html += '<p class="step-hint-text" style="text-align: left; margin-top: 12px;">Editar as cenas só é possível no computador.</p>' + scriptBtn;
      html += vsPreviousHtml(video.previous);
      return html;
    }

    // ---- Entrega ----
    function vsCopyToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise((resolve, reject) => {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.focus();
        if (area.select) area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch {}
        document.body.removeChild(area);
        if (ok) resolve(); else reject(new Error('copy'));
      });
    }

    function vsFillCopy(text, failed) {
      const box = document.getElementById('videoCopyText');
      if (!box) return;
      box.textContent = failed ? 'Não foi possível carregar o texto de publicação.' : text;
      const btn = document.getElementById('videoCopyBtn');
      if (btn) btn.disabled = Boolean(failed);
    }

    function vsLoadCopy(url) {
      if (VS_COPY_LOADING.has(url)) return;
      VS_COPY_LOADING.add(url);
      api(url, { as: 'text' }).then((text) => {
        VS_COPY_CACHE.set(url, String(text));
        vsFillCopy(String(text), false);
      }).catch(() => {
        vsFillCopy('', true);
      }).finally(() => {
        VS_COPY_LOADING.delete(url);
      });
    }

    function stepExportVideo(ctx) {
      const video = activeProject.video;
      const delivery = activeProject.delivery || { approved: [], total: 0, files: {}, zipUrl: null };
      const approved = delivery.approved || [];
      const approvedVideos = approved.filter((a) => a.kind === 'video');
      const player = video && video.latest && video.latest.approved ? video.latest : approvedVideos[0];
      let html = vsHeader({ totalSteps: ctx.totalSteps, runningBanner: '' }, 'Entregar', 'Conteúdo Pronto para Publicação', 'Baixe o vídeo aprovado e os arquivos de entrega direto no celular.');

      if (player) {
        html += vsPlayer(player, video && video.latest && video.latest.path === player.path ? video.poster : undefined);
      } else {
        html += vsAlert('warning', vsTitled('Nenhum vídeo aprovado ainda.', 'Aprove o vídeo na etapa de revisão para entregar.'));
      }

      if (delivery.coverUrl) {
        html += '<div class="section-title" style="margin-top: 16px; margin-bottom: 8px;">Capa</div>'
          + '<div style="border-radius: 10px; overflow: hidden; background: #000;"><img src="' + esc(delivery.coverUrl) + '" alt="Capa do vídeo" loading="lazy" style="width: 100%; max-height: 60vh; object-fit: contain; display: block;"></div>'
          + '<div class="scene-meta" style="margin-top: 6px;"><a href="' + esc(vsDownloadUrl(delivery.coverUrl)) + '" download="capa.png" style="color: var(--accent); font-weight: 600;">Baixar capa</a></div>';
      }

      if (delivery.copyUrl) {
        const cached = VS_COPY_CACHE.get(delivery.copyUrl);
        html += '<div class="section-title" style="margin-top: 16px; margin-bottom: 8px;">Texto de publicação</div>'
          + '<pre id="videoCopyText" class="card" style="white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.45; margin-bottom: 0; font-family: inherit;">' + esc(cached !== undefined ? cached : 'Carregando…') + '</pre>'
          + '<button type="button" id="videoCopyBtn" class="btn-sm btn-secondary" style="width: 100%; margin-top: 8px;" data-act="video-copy-text" data-url="' + esc(delivery.copyUrl) + '"' + (cached === undefined ? ' disabled' : '') + '>Copiar texto</button>';
        if (cached === undefined) vsLoadCopy(delivery.copyUrl);
      }
      if (!delivery.coverUrl || !delivery.copyUrl) {
        html += vsNote('A capa e o texto de publicação são gerados no computador; eles aparecem aqui quando já existirem.');
      }

      if (approved.length === 0) {
        html += vsEmpty('Nenhum arquivo aprovado ainda para entrega. Conclua as etapas anteriores.');
      } else {
        const groups = [['video', 'Vídeos'], ['image', 'Imagens'], ['audio', 'Áudios'], ['file', 'Outros arquivos']];
        html += groups.map((g) => {
          const items = approved.filter((a) => (g[0] === 'file' ? a.kind !== 'video' && a.kind !== 'image' && a.kind !== 'audio' : a.kind === g[0]));
          if (items.length === 0) return '';
          return '<div class="section-title" style="margin-top: 16px; margin-bottom: 8px;">' + g[1] + ' aprovados (' + items.length + ')</div>'
            + '<div style="display: flex; flex-direction: column; gap: 8px;">' + items.map((a) => '<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;">'
              + '<div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">'
              + (g[0] === 'image' ? '<img src="' + esc(a.url) + '" alt="" loading="lazy" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; flex: none;">' : '')
              + '<span style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="' + esc(a.name) + '">' + esc(a.name) + '</span></div>'
              + '<a href="' + esc(vsDownloadUrl(a.url)) + '" download="' + esc(a.name) + '" class="btn-sm btn-accent" style="text-decoration: none; white-space: nowrap;">Baixar</a>'
              + '</div>').join('') + '</div>';
        }).join('');
      }

      if (delivery.zipUrl) {
        html += '<a href="' + esc(delivery.zipUrl) + '" download class="btn-primary" style="margin-top: 16px; text-decoration: none;">Baixar ZIP</a>';
      } else if (approved.length === 0) {
        html += vsNote('O ZIP fica disponível quando houver ao menos um arquivo aprovado.');
      }
      return html;
    }

    // ---- Ações ----
    async function vsPrepareScript() {
      const data = await projectAction('start-agent', {}, { cost: 'Preparar o roteiro aciona o agente de IA (Claude) e consome créditos do provedor. Continuar?' });
      if (data) switchTab('live');
      return data;
    }

    // Aprovar o roteiro não é uma ação paga; vai para a próxima etapa da jornada (narração).
    async function vsApproveScript() {
      const nextId = vsNextStepId();
      const data = await projectAction('approve-storyboard');
      if (!data) return null;
      await window.openProjectDetail(activeProject.id, nextId || 'voice');
      return data;
    }

    async function vsApproveAudio(thenNext) {
      const nextId = vsNextStepId();
      const stepId = activeProject.journey.steps[activeStepIndex].id;
      const data = await projectAction('approve-audio');
      if (!data) return null;
      await window.openProjectDetail(activeProject.id, thenNext && nextId ? nextId : stepId, true);
      return data;
    }

    async function vsRenderVideo() {
      const video = activeProject.video;
      const cost = 'Renderizar o vídeo usa o processamento do computador e pode demorar.'
        + (video && video.basicPostVideo ? ' Atenção: este vídeo ainda usa as artes do post com movimento básico.' : '')
        + ' Continuar?';
      const data = await projectAction('render', undefined, { cost });
      if (data) switchTab('live');
      return data;
    }

    // Mesma sequência do desktop (approveAndRenderVideo): confirma o custo, aprova o roteiro e renderiza.
    async function vsApproveAndRender() {
      const video = activeProject.video;
      const message = 'Confirme que revisou cenas, textos, fatos e fontes. O VideoGo valida o roteiro, aprova e renderiza o MP4 usando o processamento do computador; pode demorar. A narração só é sintetizada após aprovação explícita.'
        + (video && video.basicPostVideo ? ' Atenção: este vídeo ainda usa as artes do post com movimento básico.' : '');
      if (!(await confirmCost(message, { title: 'Aprovar roteiro e renderizar?', okLabel: 'Aprovar e renderizar' }))) return null;
      const stepId = activeProject.journey.steps[activeStepIndex].id;
      const approved = await projectAction('approve-storyboard');
      if (!approved) return null;
      const data = await projectAction('render', undefined, { confirmed: true });
      if (data) switchTab('live');
      else await window.openProjectDetail(activeProject.id, stepId, true);
      return data;
    }

    registerAction('video-prepare-script', () => vsGuard(vsPrepareScript));
    registerAction('video-approve-script', () => vsGuard(vsApproveScript));
    registerAction('video-approve-audio', () => vsGuard(() => vsApproveAudio(false)));
    registerAction('video-render', () => vsGuard(vsRenderVideo));
    registerAction('video-goto-step', (el) => vsGoStep(el.dataset.step));

    registerAction('video-approve', () => vsGuard(async () => {
      const latest = activeProject.video && activeProject.video.latest;
      if (!latest) return;
      const data = await projectAction('approve-video', { approved: !latest.approved });
      if (data) await window.openProjectDetail(activeProject.id, 'review', true);
    }));

    registerAction('video-revision-toggle', () => {
      if (revisionDrafts[VS_REVISION_KEY] !== undefined) delete revisionDrafts[VS_REVISION_KEY];
      else revisionDrafts[VS_REVISION_KEY] = '';
      renderProjectJourneyView();
    });

    registerAction('video-revision-input', (el) => {
      revisionDrafts[VS_REVISION_KEY] = el.value;
      const send = document.getElementById('videoRevisionSend');
      if (send) send.disabled = activeProject.isRunning || !String(el.value).trim();
    });

    registerAction('video-revision-send', () => vsGuard(async () => {
      const note = String(revisionDrafts[VS_REVISION_KEY] || '').trim();
      if (!note) return;
      const data = await projectAction('request-video-revision', { note }, { cost: 'Pedir a revisão aciona o agente de IA (Claude), que altera o roteiro e a animação, e consome créditos. Depois será preciso renderizar de novo. Continuar?' });
      if (!data) return;
      delete revisionDrafts[VS_REVISION_KEY];
      renderProjectJourneyView();
      switchTab('live');
    }));

    registerAction('video-copy-text', async (el) => {
      const text = VS_COPY_CACHE.get(el.dataset.url);
      if (text === undefined) return;
      try {
        await vsCopyToClipboard(text);
        toast('Texto copiado.');
      } catch {
        toast('Não foi possível copiar. Selecione o texto e copie manualmente.', 'error');
      }
    });

    // ---- Rodapé (um botão por etapa, calculado no servidor por videoFooterAction) ----
    const VS_ADVANCE_KINDS = ['continue', 'deliver', 'go-review', 'go-render', 'go-script', 'prepare-script', 'approve-script', 'produce-video', 'approve-render', 'render', 'approve-audio', 'save-brief'];

    function computeVideoAdvance(stepId) {
      if (!activeProject || activeProject.kind !== 'video') return null;
      const action = activeProject.footerActions && activeProject.footerActions[stepId];
      if (!action) return null;
      if (vsAdvanceBusy) return { kind: 'wait', label: 'Aguarde…', enabled: false };
      if (stepId === 'brief') {
        const topicEl = document.getElementById('editBriefTopic');
        if (topicEl) {
          const field = String(topicEl.value || '').trim();
          if (!field) return { kind: 'wait', label: 'Escreva a pauta para continuar', enabled: false };
          if (field !== String(activeProject.brief || '').trim()) return { kind: 'save-brief', label: 'Salvar e continuar', enabled: true };
        }
      }
      const known = VS_ADVANCE_KINDS.indexOf(action.kind) >= 0;
      // O hint do desktop fala em gravar/enviar áudio e gerar com ElevenLabs; no celular isso é feito no computador.
      const hint = action.kind === 'go-script' ? 'A narração só avança depois do roteiro aprovado.' : action.hint;
      return { kind: action.kind, label: action.label, enabled: Boolean(action.enabled) && known, hint };
    }

    function vsRefreshAdvance() {
      const btn = document.getElementById('stepAdvanceBtn');
      if (!btn || !activeProject || activeProject.kind !== 'video') return;
      const step = activeProject.journey && activeProject.journey.steps && activeProject.journey.steps[activeStepIndex];
      const action = step ? computeVideoAdvance(step.id) : null;
      if (!action) return;
      btn.textContent = action.label;
      btn.disabled = !action.enabled;
      const hint = document.getElementById('stepAdvanceHint');
      if (hint) {
        hint.textContent = action.hint || '';
        hint.style.display = action.hint ? '' : 'none';
      }
    }

    // A pauta (stepBrief) é compartilhada com as imagens: o botão do rodapé acompanha a edição.
    document.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'editBriefTopic') vsRefreshAdvance();
    });

    async function advanceVideoStep() {
      if (!activeProject || activeProject.kind !== 'video' || vsAdvanceBusy) return;
      const step = activeProject.journey && activeProject.journey.steps && activeProject.journey.steps[activeStepIndex];
      const action = step ? computeVideoAdvance(step.id) : null;
      if (!action || !action.enabled) return;
      vsAdvanceBusy = true;
      vsRefreshAdvance();
      try {
        switch (action.kind) {
          case 'save-brief':
            if (typeof window.saveBrief === 'function' && (await window.saveBrief())) nextStep();
            break;
          case 'continue':
          case 'deliver':
          case 'go-review':
            nextStep();
            break;
          case 'go-script':
            vsGoStep('script');
            break;
          case 'go-render':
            vsGoStep('render');
            break;
          case 'prepare-script':
            await vsPrepareScript();
            break;
          case 'approve-script':
            await vsApproveScript();
            break;
          case 'produce-video':
            if (await projectAction('produce-video', {}, { cost: 'Produzir as cenas aciona o Claude Opus 5.5, que cria a animação e aplica efeitos e trilha, e consome créditos. Depois aprove o roteiro e renderize. Continuar?' })) switchTab('live');
            break;
          case 'approve-render':
            await vsApproveAndRender();
            break;
          case 'render':
            await vsRenderVideo();
            break;
          case 'approve-audio':
            await vsApproveAudio(true);
            break;
        }
      } finally {
        vsAdvanceBusy = false;
        vsRefreshAdvance();
      }
    }

`;
