// Criação de conteúdo.
export const SCRIPT_CREATE = `    // Create Content Workflow Handlers
    // Mesmos ids de POSTNOW_FORMATS (src/shared/formats.ts) e VideoGoFormatId (src/shared/contracts.ts); o servidor valida o formato.
    const IMAGE_FORMAT_LIST = [
      ['carousel-4x5', 'Carrossel vertical 4:5 (Instagram)'],
      ['carousel-1x1', 'Carrossel quadrado 1:1 (Feed)'],
      ['carousel-4x3', 'Carrossel horizontal 4:3'],
      ['post-4x5', 'Post vertical 4:5'],
      ['post-1x1', 'Post quadrado 1:1'],
      ['post-4x3', 'Post horizontal 4:3'],
      ['story-9x16', 'Story 9:16'],
    ];
    const VIDEO_FORMAT_LIST = [
      ['reels', 'Reels / Shorts / TikTok (9:16)'],
      ['story', 'Story vídeo (9:16)'],
      ['feed-square', 'Feed quadrado (1:1)'],
      ['youtube', 'YouTube horizontal (16:9)'],
    ];
    function formatLabel(id) {
      const found = IMAGE_FORMAT_LIST.concat(VIDEO_FORMAT_LIST).find(f => f[0] === id);
      return found ? found[1] : String(id);
    }
    function titlePrefix(kind, format) {
      return kind === 'video' ? 'Vídeo: ' : format.startsWith('carousel-') ? 'Carrossel: ' : format.startsWith('story-') ? 'Story: ' : 'Post: ';
    }

    const createFormatSelect = document.getElementById('createFormat');
    const createBrandSelect = document.getElementById('createBrand');
    const createBrandHint = document.getElementById('createBrandHint');
    const pageCountGroup = document.getElementById('pageCountGroup');
    let brandsData = [];

    function fillFormatOptions(list) {
      createFormatSelect.innerHTML = list.map(f => \`<option value="\${esc(f[0])}">\${esc(f[1])}</option>\`).join('');
    }

    function updatePageCountVisibility() {
      pageCountGroup.style.display = selectedCreateKind === 'image' && createFormatSelect.value.startsWith('carousel-') ? 'block' : 'none';
    }

    // Aviso: gerar imagens exige marca com logo (a marca é opcional só para pauta e textos).
    function updateBrandHint() {
      const brand = brandsData.find(b => b.id === createBrandSelect.value);
      const needsLogo = selectedCreateKind === 'image' && (!brand || !brand.hasLogo);
      createBrandHint.style.display = needsLogo ? 'block' : 'none';
      createBrandHint.textContent = brand
        ? 'Esta marca não tem logo cadastrado. Para gerar imagens é preciso uma marca com logo.'
        : 'Para gerar imagens é preciso escolher uma marca com logo. Sem marca, você só prepara a pauta e os textos.';
    }

    async function loadBrands() {
      let data;
      try {
        data = await api('/api/brands');
      } catch {
        return;
      }
      if (!Array.isArray(data)) return;
      brandsData = data;
      const current = createBrandSelect.value;
      createBrandSelect.innerHTML = '<option value="">Sem marca</option>' +
        data.map(b => \`<option value="\${esc(b.id)}">\${esc(b.name)}\${b.hasLogo ? '' : ' (sem logo)'}</option>\`).join('');
      createBrandSelect.value = data.some(b => b.id === current) ? current : '';
      updateBrandHint();
    }

    function openCreateModal() {
      createProjectModal.style.display = 'flex';
      updateRecipeDropdown();
      loadBrands();
      document.getElementById('createTopic').focus();
    }

    if (topCreateBtn) topCreateBtn.addEventListener('click', openCreateModal);
    if (openCreateBtn) openCreateBtn.addEventListener('click', openCreateModal);

    closeCreateModalBtn.addEventListener('click', () => {
      createProjectModal.style.display = 'none';
    });

    function selectCreateKind(kind) {
      selectedCreateKind = kind;
      const typeImage = document.getElementById('typeImageBtn');
      const typeVideo = document.getElementById('typeVideoBtn');

      document.getElementById('createUseBrandImages').value = kind === 'video' ? 'yes' : 'no';
      if (kind === 'image') {
        typeImage.className = 'create-type-btn selected';
        typeVideo.className = 'create-type-btn';
        fillFormatOptions(IMAGE_FORMAT_LIST);
      } else {
        typeImage.className = 'create-type-btn';
        typeVideo.className = 'create-type-btn selected';
        fillFormatOptions(VIDEO_FORMAT_LIST);
      }
      updatePageCountVisibility();
      updateBrandHint();
      updateRecipeDropdown();
    }
    registerAction('create-kind', (el) => selectCreateKind(el.dataset.kind));
    createFormatSelect.addEventListener('change', updatePageCountVisibility);
    createBrandSelect.addEventListener('change', updateBrandHint);
    selectCreateKind('image');

    // Auto suggest title while typing topic
    document.getElementById('createTopic').addEventListener('input', (e) => {
      const titleInput = document.getElementById('createTitle');
      if (!titleInput.dataset.manual) {
        const val = e.target.value.trim();
        if (val) {
          titleInput.value = titlePrefix(selectedCreateKind, createFormatSelect.value) + val.slice(0, 36);
        }
      }
    });

    document.getElementById('createTitle').addEventListener('input', () => {
      document.getElementById('createTitle').dataset.manual = '1';
    });

    createProjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('submitCreateBtn');
      if (submitBtn.disabled) return;
      const topic = document.getElementById('createTopic').value.trim();
      let title = document.getElementById('createTitle').value.trim();
      const format = createFormatSelect.value;
      const photoPolicy = document.getElementById('createUseBrandImages').value === 'yes';
      if (!title) title = titlePrefix(selectedCreateKind, format) + topic.slice(0, 30);
      const pageCount = Number(document.getElementById('createPages').value) || 5;
      const audience = document.getElementById('createAudience').value.trim();
      const tone = document.getElementById('createTone').value.trim();
      const cta = document.getElementById('createCta').value.trim();
      const brandId = createBrandSelect.value;
      let autoStart = document.getElementById('createAutoStart').checked;

      if (autoStart) {
        autoStart = await confirmCost('Criar o projeto e iniciar o agente de IA agora? O agente consome créditos do provedor.', { title: 'Iniciar o agente de IA', okLabel: 'Criar e iniciar', cancelLabel: 'Só criar' });
      }

      const fullBrief = [
        '## Pauta e Objetivo\\n' + topic,
        '- Público: ' + (audience || 'Geral'),
        '- Tom de voz: ' + (tone || 'Direto e claro'),
        '- Chamada para ação: ' + (cta || 'Compartilhe'),
        '- Formato: ' + format,
        '- Fotos de referência da marca: ' + (photoPolicy ? 'usar quando pertinentes e autorizadas' : 'não usar'),
      ].join('\\n');

      const idleLabel = '<span>🚀 Criar e Iniciar Produção</span>';
      submitBtn.disabled = true;
      submitBtn.textContent = autoStart ? 'Criando projeto e disparando IA...' : 'Criando projeto...';

      try {
        const data = await api('/api/projects', {
          method: 'POST',
          body: {
            title,
            topic,
            useBrandImages: photoPolicy,
            kind: selectedCreateKind,
            format,
            ...(brandId ? { brandId } : {}),
            ...(selectedCreateKind === 'image' && format.startsWith('carousel-') ? { pageCount } : {}),
            brief: fullBrief,
            ...(autoStart ? { autoStartAgent: true, confirm: true } : {}),
          },
        });

        if (data && data.ok && data.project) {
          createProjectModal.style.display = 'none';
          createProjectForm.reset();
          delete document.getElementById('createTitle').dataset.manual;
          selectCreateKind('image');
          if (data.jobId) toast('Projeto criado e agente iniciado. Acompanhe na aba Ao Vivo.');
          else toast('Projeto criado.');
          switchTab('projects');
          loadJobs();
          // Open project directly in the journey view!
          window.openProjectDetail(data.project.id);
        } else {
          toast((data && data.error) || 'Erro ao criar projeto.', 'error');
        }
      } catch (err) {
        reportError(err, 'Erro ao criar o projeto.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = idleLabel;
      }
    });
`;
