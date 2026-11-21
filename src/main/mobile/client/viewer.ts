// Visualizador em tela cheia (carrossel/pager), faixa de miniaturas, galeria de arquivos e lightbox de áudio/arquivo.
export const SCRIPT_VIEWER = `    // ---- Estilos do visualizador e das etapas de imagem (injetados uma vez; styles.ts é de outro dono) ----
    const MDC_EXTRA_CSS = [
      '.vw-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:100;background:#000;color:#fff;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}',
      '.vw-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;min-height:56px}',
      '.vw-counter{font-weight:700;font-size:15px;min-width:52px;font-variant-numeric:tabular-nums}',
      '.vw-title{flex:1;min-width:0;font-size:12px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.vw-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:44px;padding:0 12px;border:0;border-radius:10px;background:rgba(255,255,255,0.14);color:#fff;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer}',
      '.vw-stage{position:relative;flex:1;min-height:0}',
      '.vw-track{display:flex;height:100%;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;touch-action:pan-x pinch-zoom;overscroll-behavior-x:contain;outline:none}',
      '.vw-track::-webkit-scrollbar{display:none}',
      '.vw-slide{flex:0 0 100%;width:100%;height:100%;min-width:0;scroll-snap-align:center;scroll-snap-stop:always;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:0 4px}',
      '.vw-slide img,.vw-slide video{max-width:100%;max-height:100%;object-fit:contain;-webkit-user-select:none;user-select:none;-webkit-user-drag:none}',
      '.vw-slide audio{width:100%;max-width:340px}',
      '.vw-file-name{font-size:13px;color:#d4d4d8;text-align:center;word-break:break-word;padding:0 16px}',
      '.vw-nav{position:absolute;top:50%;margin-top:-24px;width:48px;height:48px;border:0;border-radius:24px;background:rgba(0,0,0,0.55);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2}',
      '.vw-nav:disabled{opacity:0;pointer-events:none}',
      '.vw-prev{left:6px}.vw-next{right:6px}',
      '.vw-dots{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;padding:2px 12px}',
      '.vw-dot{width:24px;height:24px;border:0;background:none;display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '.vw-dot::after{content:"";width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.35)}',
      '.vw-dot.active::after{background:#fff;width:10px;height:10px}',
      '.vw-foot{padding:8px 12px 12px;max-height:46vh;max-height:46dvh;overflow-y:auto;background:#0b0b0d;border-top:1px solid #27272a}',
      '.vw-foot:empty{display:none}',
      '.pager-strip{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;padding:4px 2px 10px}',
      '.pager-thumb{position:relative;flex:0 0 118px;width:118px;aspect-ratio:1;border:1px solid var(--border);border-radius:10px;background:#000;padding:0;overflow:hidden;scroll-snap-align:start;cursor:pointer;color:#fff}',
      '.pager-thumb img,.pager-thumb video{width:100%;height:100%;object-fit:contain;display:block;pointer-events:none}',
      '.pager-num{position:absolute;left:6px;bottom:6px;padding:1px 6px;border-radius:6px;background:rgba(0,0,0,0.7);font-size:11px;font-weight:700}',
      '.pager-flag{position:absolute;right:6px;top:6px;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:700;background:rgba(0,0,0,0.7)}',
      '.pager-flag.is-kept{color:#4ade80}.pager-flag.is-redo{color:#f87171}',
      '.thumb-icon{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--surface)}',
      '.mdc-hint{font-size:12px;color:var(--muted);line-height:1.4}',
      '.mdc-section-title{font-size:13px;font-weight:700;margin:14px 0 8px}',
      '.counter-row{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}',
      '.counter-chip{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--muted)}',
      '.counter-chip.is-kept{color:#4ade80;border-color:rgba(74,222,128,0.35)}.counter-chip.is-redo{color:#f87171;border-color:rgba(248,113,113,0.35)}',
      '.caption-box{margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}',
      '.caption-text{width:100%;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--fg);font-size:16px;line-height:1.45;padding:10px;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text}',
      '.btn-touch{min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;cursor:pointer}',
      '.btn-touch[disabled],.btn-touch[aria-disabled="true"]{opacity:0.5;cursor:not-allowed;pointer-events:none}',
      '.review-item-card .btn-review-keep,.review-item-card .btn-review-redo,.vw-foot .btn-review-keep,.vw-foot .btn-review-redo{min-height:44px;font-size:13px}',
      '.review-item-img{cursor:pointer;display:block}',
      'button.review-item-imgbtn{display:block;width:100%;padding:0;border:0;background:#000;cursor:pointer}',
      '.review-item-card .review-item-img{object-fit:contain}',
      '.redo-note{font-size:16px;min-height:64px}',
      '.decision-box{display:flex;flex-direction:column;gap:8px}',
      '.decision-clear{align-self:flex-start;background:none;border:0;color:var(--muted);font-size:12px;text-decoration:underline;min-height:44px;padding:0 4px;cursor:pointer}',
      '.claims-box{margin-top:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}',
      '.claims-box summary{padding:12px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px}',
      '.claim-item{padding:10px 12px;border-top:1px solid var(--border);font-size:12px;line-height:1.45}',
      '.claim-item a{color:var(--accent);word-break:break-all}',
      '.deliver-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px}',
      '.deliver-row .deliver-thumb{width:44px;height:44px;flex:0 0 44px;border-radius:6px;overflow:hidden;background:#000}',
      '.deliver-row .deliver-thumb img,.deliver-row .deliver-thumb video{width:100%;height:100%;object-fit:cover;display:block}',
      '.deliver-name{flex:1;min-width:0;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      'body.vw-lock{overflow:hidden}'
    ].join('');

    function ensureViewerStyles() {
      if (!document.head || document.getElementById('mdcExtraStyles')) return;
      const style = document.createElement('style');
      style.id = 'mdcExtraStyles';
      style.textContent = MDC_EXTRA_CSS;
      document.head.appendChild(style);
    }
    ensureViewerStyles();

    // ---- Ícones e peças de mídia reutilizáveis ----
    const ICON_ATTRS = ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const ICON_CLOSE = '<svg width="22" height="22"' + ICON_ATTRS + '><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const ICON_PREV = '<svg width="24" height="24"' + ICON_ATTRS + '><polyline points="15 18 9 12 15 6"/></svg>';
    const ICON_NEXT = '<svg width="24" height="24"' + ICON_ATTRS + '><polyline points="9 18 15 12 9 6"/></svg>';
    const ICON_DOWNLOAD = '<svg width="18" height="18"' + ICON_ATTRS + '><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    const ICON_AUDIO = '<svg width="36" height="36"' + ICON_ATTRS + ' style="color:var(--accent)"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
    const ICON_FILE = '<svg width="36" height="36"' + ICON_ATTRS + ' style="color:var(--muted)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

    // Link de download: as URLs do servidor já têm ?v=&token=, mas o acréscimo precisa funcionar nos dois casos.
    function downloadUrl(url) {
      const u = String(url || '');
      return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'download=1';
    }
    // Vídeo com #t=0.1 mostra o primeiro quadro como miniatura sem tocar o arquivo.
    function videoSrc(url) {
      return String(url || '') + '#t=0.1';
    }
    function thumbMediaHtml(a) {
      if (a.kind === 'image') return '<img src="' + esc(a.url) + '" alt="' + esc(a.name) + '" loading="lazy">';
      if (a.kind === 'video') return '<video src="' + esc(videoSrc(a.url)) + '" preload="metadata" muted playsinline></video>';
      return '<div class="thumb-icon">' + (a.kind === 'audio' ? ICON_AUDIO : ICON_FILE) + '</div>';
    }
    function baseName(name) {
      const s = String(name || '');
      return s.slice(s.lastIndexOf('/') + 1) || s;
    }
    function downloadLinkHtml(a, label, cls) {
      return '<a href="' + esc(downloadUrl(a.url)) + '" download="' + esc(baseName(a.name)) + '" class="' + (cls || 'btn-sm btn-accent btn-touch') + '" aria-label="Baixar ' + esc(baseName(a.name)) + '">' + ICON_DOWNLOAD + (label ? esc(label) : '') + '</a>';
    }

    // Faixa horizontal de miniaturas. Cada uma abre o visualizador no índice dela sobre a lista nomeada em data-src
    // (gallery | review | export | media; veja viewerSource).
    function carouselStripHtml(items, opts) {
      const o = opts || {};
      const list = items || [];
      if (!list.length) return '';
      const src = o.src || 'gallery';
      return '<div class="pager-strip" aria-label="' + esc(o.label || 'Imagens') + '">' + list.map((a, i) => {
        let flag = '';
        if (o.flags) {
          if (a.approved) flag = '<span class="pager-flag is-kept">Aprovada</span>';
          else if (a.redo) flag = '<span class="pager-flag is-redo">Refazer</span>';
        }
        return '<button type="button" class="pager-thumb" data-act="open-viewer" data-src="' + esc(src) + '" data-index="' + i + '" aria-label="Abrir ' + esc(a.name) + ' (' + (i + 1) + ' de ' + list.length + ')">'
          + thumbMediaHtml(a) + '<span class="pager-num">' + (i + 1) + '/' + list.length + '</span>' + flag + '</button>';
      }).join('') + '</div>';
    }

    // ---- Visualizador em tela cheia ----
    // openViewer(items, index, { footer?(item, index) -> html, getItems?() -> items, onClose?() })
    // footer desenha controles do item atual (decisões na revisão); getItems permite syncViewer() reler a lista depois de um refresh.
    let viewer = null;
    let viewerSuppressPop = 0;
    let viewerPopBound = false;

    function viewerSlideHtml(a, i, eager) {
      const name = esc(a.name);
      let inner;
      if (a.kind === 'image') {
        inner = '<img src="' + esc(a.url) + '" alt="' + name + '" draggable="false" loading="' + (eager ? 'eager' : 'lazy') + '">';
      } else if (a.kind === 'video') {
        inner = '<video src="' + esc(videoSrc(a.url)) + '" controls playsinline preload="metadata"></video>';
      } else if (a.kind === 'audio') {
        inner = ICON_AUDIO + '<div class="vw-file-name">' + name + '</div><audio src="' + esc(a.url) + '" controls preload="metadata"></audio>';
      } else {
        inner = ICON_FILE + '<div class="vw-file-name">' + name + '</div>';
      }
      return '<div class="vw-slide" data-i="' + i + '" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' de ' + viewer.items.length + '">' + inner + '</div>';
    }

    function viewerTrackHtml() {
      return viewer.items.map((a, i) => viewerSlideHtml(a, i, Math.abs(i - viewer.index) <= 1)).join('');
    }

    function viewerDotsHtml() {
      if (viewer.items.length < 2 || viewer.items.length > 12) return '';
      return viewer.items.map((a, i) => '<button type="button" class="vw-dot' + (i === viewer.index ? ' active' : '') + '" data-act="viewer-goto" data-index="' + i + '" aria-label="Ir para ' + (i + 1) + ' de ' + viewer.items.length + '"' + (i === viewer.index ? ' aria-current="true"' : '') + '></button>').join('');
    }

    function pauseViewerMedia(except) {
      if (!viewer || !viewer.overlay.querySelectorAll) return;
      viewer.overlay.querySelectorAll('video, audio').forEach(m => {
        if (except && m.closest && m.closest('[data-i="' + except + '"]')) return;
        try { m.pause(); } catch {}
      });
    }

    function renderViewerChrome(opts) {
      if (!viewer) return;
      const o = opts || {};
      const item = viewer.items[viewer.index];
      const total = viewer.items.length;
      const q = (sel) => viewer.overlay.querySelector(sel);
      const counter = q('.vw-counter');
      if (counter) counter.textContent = (viewer.index + 1) + '/' + total;
      const title = q('.vw-title');
      if (title) title.textContent = baseName(item.name);
      const dl = q('.vw-download');
      if (dl) {
        dl.setAttribute('href', downloadUrl(item.url));
        dl.setAttribute('download', baseName(item.name));
        dl.setAttribute('aria-label', 'Baixar ' + item.name);
      }
      const prev = q('.vw-prev');
      const next = q('.vw-next');
      if (prev) prev.disabled = viewer.index <= 0;
      if (next) next.disabled = viewer.index >= total - 1;
      const dots = q('.vw-dots');
      if (dots) dots.innerHTML = viewerDotsHtml();
      const foot = q('.vw-foot');
      if (foot && viewer.opts.footer && !o.skipFoot) foot.innerHTML = viewer.opts.footer(item, viewer.index) || '';
    }

    function setViewerIndex(i, fromScroll) {
      if (!viewer) return;
      const clamped = Math.min(Math.max(i, 0), viewer.items.length - 1);
      const changed = clamped !== viewer.index;
      viewer.index = clamped;
      if (changed) {
        pauseViewerMedia(clamped);
        renderViewerChrome();
        if (viewer.overlay.querySelectorAll) {
          viewer.overlay.querySelectorAll('.vw-slide img').forEach((img, n) => { if (Math.abs(n - clamped) <= 1) img.loading = 'eager'; });
        }
      }
    }

    function viewerGoto(i) {
      if (!viewer) return;
      const clamped = Math.min(Math.max(i, 0), viewer.items.length - 1);
      const track = viewer.track;
      const smooth = !prefersReducedMotion();
      viewer.lockUntil = Date.now() + (smooth ? 500 : 80);
      setViewerIndex(clamped);
      if (track && track.scrollTo) track.scrollTo({ left: clamped * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    }

    function onViewerScroll() {
      if (!viewer) return;
      clearTimeout(viewer.scrollTimer);
      viewer.scrollTimer = setTimeout(() => {
        if (!viewer) return;
        if (Date.now() < viewer.lockUntil) return;
        const w = viewer.track.clientWidth || 1;
        setViewerIndex(Math.round(viewer.track.scrollLeft / w), true);
      }, 60);
    }

    function openViewer(items, index, opts) {
      const list = (items || []).filter(Boolean);
      if (!list.length) return;
      if (viewer) teardownViewer();
      ensureViewerStyles();
      const o = opts || {};
      const start = Math.min(Math.max(Number(index) || 0, 0), list.length - 1);
      const overlay = document.createElement('div');
      overlay.className = 'vw-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Visualizador de arquivos');
      viewer = { overlay, items: list, index: start, opts: o, track: null, lockUntil: 0, scrollTimer: null, pushed: false, previousFocus: document.activeElement, bodyOverflow: document.body.style ? document.body.style.overflow : '' };
      overlay.innerHTML =
        '<div class="vw-bar">'
        + '<span class="vw-counter" aria-live="polite"></span>'
        + '<span class="vw-title"></span>'
        + '<a class="vw-btn vw-download" href="#" download aria-label="Baixar">' + ICON_DOWNLOAD + '<span>Baixar</span></a>'
        + '<button type="button" class="vw-btn vw-close" data-act="viewer-close" aria-label="Fechar visualizador">' + ICON_CLOSE + '</button>'
        + '</div>'
        + '<div class="vw-stage">'
        + '<button type="button" class="vw-nav vw-prev" data-act="viewer-prev" aria-label="Anterior">' + ICON_PREV + '</button>'
        + '<div class="vw-track" tabindex="0">' + viewerTrackHtml() + '</div>'
        + '<button type="button" class="vw-nav vw-next" data-act="viewer-next" aria-label="Próximo">' + ICON_NEXT + '</button>'
        + '</div>'
        + '<div class="vw-dots"></div>'
        + '<div class="vw-foot"></div>';
      document.body.appendChild(overlay);
      if (document.body.style) document.body.style.overflow = 'hidden';
      viewer.track = overlay.querySelector('.vw-track');
      if (viewer.track) {
        viewer.track.scrollLeft = start * viewer.track.clientWidth;
        viewer.track.addEventListener('scroll', onViewerScroll, { passive: true });
      }
      renderViewerChrome();
      if (window.history && window.history.pushState) {
        try { window.history.pushState({ mdcViewer: true }, ''); viewer.pushed = true; } catch {}
      }
      if (window.addEventListener && !viewerPopBound) {
        window.addEventListener('popstate', onViewerPop);
        viewerPopBound = true;
      }
      const closeBtn = overlay.querySelector('.vw-close');
      if (closeBtn && closeBtn.focus) closeBtn.focus();
    }

    function teardownViewer() {
      if (!viewer) return;
      const v = viewer;
      viewer = null;
      clearTimeout(v.scrollTimer);
      try { v.overlay.querySelectorAll('video, audio').forEach(m => { try { m.pause(); } catch {} }); } catch {}
      if (v.overlay.parentNode) v.overlay.parentNode.removeChild(v.overlay);
      if (document.body.style) document.body.style.overflow = v.bodyOverflow || '';
      if (v.previousFocus && v.previousFocus.focus && v.previousFocus !== document.body) { try { v.previousFocus.focus(); } catch {} }
      if (v.opts.onClose) { try { v.opts.onClose(); } catch {} }
      return v;
    }

    function closeViewer() {
      const v = teardownViewer();
      if (v && v.pushed && window.history && window.history.state && window.history.state.mdcViewer) {
        viewerSuppressPop++;
        window.history.back();
        setTimeout(() => { if (viewerSuppressPop > 0) viewerSuppressPop--; }, 700);
      }
    }

    // Gesto/botão voltar do navegador fecha o visualizador em vez de sair da tela.
    function onViewerPop() {
      if (viewerSuppressPop > 0) { viewerSuppressPop--; return; }
      if (viewer) { viewer.pushed = false; teardownViewer(); }
    }

    // Depois de um refresh do projeto: relê a lista (getItems) e redesenha os controles do item atual.
    function syncViewer() {
      if (!viewer || !viewer.opts.getItems) return;
      const items = (viewer.opts.getItems() || []).filter(Boolean);
      if (!items.length) { closeViewer(); return; }
      const same = items.length === viewer.items.length && items.every((a, i) => a.url === viewer.items[i].url);
      viewer.items = items;
      viewer.index = Math.min(viewer.index, items.length - 1);
      if (!same && viewer.track) {
        viewer.track.innerHTML = viewerTrackHtml();
        viewer.track.scrollLeft = viewer.index * viewer.track.clientWidth;
      }
      const foot = viewer.overlay.querySelector('.vw-foot');
      const ae = document.activeElement;
      const typing = Boolean(foot && ae && ae.tagName === 'TEXTAREA' && foot.contains && foot.contains(ae));
      renderViewerChrome({ skipFoot: typing });
    }

    document.addEventListener('keydown', (e) => {
      if (!viewer) return;
      if (document.querySelector && document.querySelector('.confirm-overlay')) return;
      const t = e.target;
      const typing = Boolean(t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === 'Escape') { e.preventDefault(); closeViewer(); return; }
      if (typing) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); viewerGoto(viewer.index - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); viewerGoto(viewer.index + 1); }
    });

    registerAction('viewer-close', () => closeViewer());
    registerAction('viewer-prev', () => viewer && viewerGoto(viewer.index - 1));
    registerAction('viewer-next', () => viewer && viewerGoto(viewer.index + 1));
    registerAction('viewer-goto', (el) => viewerGoto(Number(el.dataset.index)));

    // Lista de itens por nome de fonte (data-src das miniaturas); só o que a etapa de imagens define é opcional.
    function viewerSource(src) {
      const p = activeProject;
      if (!p) return [];
      if (src === 'review' && typeof reviewableItems === 'function') return reviewableItems();
      if (src === 'export' && typeof exportImageItems === 'function') return exportImageItems();
      if (src === 'media') return mediaAssets();
      return (p.gallery && p.gallery.items) || [];
    }
    function viewerOptsFor(src) {
      if (src === 'review' && typeof reviewFooterHtml === 'function') {
        return { footer: reviewFooterHtml, getItems: reviewableItems, onClose: () => { if (activeProject) renderActiveStep(); } };
      }
      return {};
    }
    registerAction('open-viewer', (el) => {
      const src = el.dataset.src || 'gallery';
      openViewer(viewerSource(src), Number(el.dataset.index) || 0, viewerOptsFor(src));
    });

    // ---- Galeria de arquivos do projeto ----
    function mediaAssets() {
      return ((activeProject && activeProject.assets) || []).filter(a => a.kind === 'image' || a.kind === 'video');
    }

    function renderProjectAssetsGallery() {
      if (!activeProject) return;
      const assets = activeProject.assets || [];
      const count = document.getElementById('detailAssetCount');
      if (count) count.textContent = assets.length + ' arquivo(s)';
      const grid = document.getElementById('detailAssetsGrid');
      if (!grid) return;
      if (assets.length === 0) {
        grid.innerHTML = '<p style="color:var(--muted); font-size:13px; grid-column: 1 / -1; text-align:center; padding:20px;">Nenhum arquivo gerado ainda para este projeto.</p>';
        return;
      }
      grid.innerHTML = assets.map((a, idx) => \`
        <div class="asset-item">
          <div class="asset-media-preview" role="button" tabindex="0" data-act="open-asset" data-index="\${idx}" aria-label="Abrir \${esc(a.name)}">
            \${thumbMediaHtml(a)}
          </div>
          <div class="asset-meta">
            <span class="asset-name" title="\${esc(a.name)}">\${esc(baseName(a.name))}</span>
            <a href="\${esc(downloadUrl(a.url))}" download="\${esc(baseName(a.name))}" class="asset-download" title="Baixar" aria-label="Baixar \${esc(baseName(a.name))}">\${ICON_DOWNLOAD}</a>
          </div>
        </div>
      \`).join('');
    }

    // Imagem/vídeo: pager sobre todas as imagens e vídeos em ordem. Áudio/arquivo: janela simples.
    window.openLightbox = (index) => {
      if (!activeProject || !activeProject.assets) return;
      const asset = activeProject.assets[index];
      if (!asset) return;
      if (asset.kind === 'image' || asset.kind === 'video') {
        const media = mediaAssets();
        openViewer(media, Math.max(0, media.findIndex(m => m.path === asset.path)), {});
        return;
      }
      lightboxTitle.textContent = baseName(asset.name);
      lightboxDownloadBtn.href = downloadUrl(asset.url);
      lightboxDownloadBtn.setAttribute('download', baseName(asset.name));
      if (asset.kind === 'audio') {
        lightboxContent.innerHTML = \`<audio src="\${esc(asset.url)}" controls preload="metadata" style="width:100%;max-width:320px;"></audio>\`;
      } else {
        lightboxContent.innerHTML = \`<p style="color:#fff;">Arquivo: \${esc(asset.name)}</p>\`;
      }
      lightboxModal.style.display = 'flex';
    };
    registerAction('open-asset', (el) => window.openLightbox(Number(el.dataset.index)));

    function closeLightbox() {
      lightboxModal.style.display = 'none';
      lightboxContent.innerHTML = '';
    }
    lightboxCloseBtn.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightboxModal.style.display !== 'none') closeLightbox();
    });

    // Copiar texto: Clipboard API (exige HTTPS, o túnel tem) e, sem ela, seleção + execCommand; por fim o texto fica selecionado para copiar à mão.
    async function copyText(text, sourceEl) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          toast('Legenda copiada.');
          return true;
        }
      } catch {}
      try {
        let el = sourceEl;
        let temp = false;
        if (!el || !el.select) {
          el = document.createElement('textarea');
          el.value = text;
          el.setAttribute('readonly', '');
          el.style.position = 'fixed';
          el.style.opacity = '0';
          document.body.appendChild(el);
          temp = true;
        }
        el.focus();
        el.select();
        if (el.setSelectionRange) el.setSelectionRange(0, text.length);
        const ok = document.execCommand && document.execCommand('copy');
        if (temp) document.body.removeChild(el);
        if (ok) { toast('Legenda copiada.'); return true; }
      } catch {}
      toast('Não foi possível copiar sozinho. Segure o texto, selecione tudo e escolha Copiar.', 'error');
      return false;
    }

`;
