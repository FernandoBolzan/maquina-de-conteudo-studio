import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, AudioLines, Check, CheckCheck, ChevronLeft, ChevronRight, Download, FileText, Film, FolderOpen, Image, Layers, Play, Plus, Save, Send, Sparkles, TerminalSquare, WandSparkles } from 'lucide-react';
import type { Asset, Job, Project, ProjectDetail, Provider } from '../shared/contracts';
import { Empty, ErrorNotice, Loading } from './components';
import { errorMessage, invoke, useJobs, type ScreenProps } from './state';
import { ActivityCard } from './Console';

function Media({ projectId, asset }: { projectId: string; asset: Asset }) {
  const [content, setContent] = useState<string | null>(null);
  const [textError, setTextError] = useState('');
  useEffect(() => {
    if (asset.kind !== 'file') return;
    let active = true;
    setContent(null);
    setTextError('');
    void invoke<{ content: string }>('projects.readText', { id: projectId, path: asset.path })
      .then(res => { if (active) setContent(res.content); })
      .catch(err => { if (active) setTextError(errorMessage(err)); });
    return () => { active = false; };
  }, [projectId, asset.kind, asset.path]);

  if (asset.kind === 'image') return <img className="media-image" src={asset.url} alt={asset.name} />;
  if (asset.kind === 'video') return <video className="media-video" src={asset.url} controls preload="metadata" aria-label={asset.name} />;
  if (asset.kind === 'audio') return <div className="audio-preview"><AudioLines size={52} strokeWidth={1} /><p>{asset.name}</p><audio src={asset.url} controls preload="metadata" aria-label={asset.name} /></div>;
  return (
    <div className="text-preview-wrap">
      <div className="text-preview-head">
        <FileText size={16} className="icon-ok" />
        <strong>{asset.name}</strong>
      </div>
      {textError ? (
        <p className="muted">{textError}</p>
      ) : content === null ? (
        <p className="muted">Carregando arquivo…</p>
      ) : (
        <pre className="text-preview-box">{content || '(arquivo vazio)'}</pre>
      )}
    </div>
  );
}

export function Studio({ id, snapshot, run, busy, confirm, refresh, openJob, onOpen, onBack }: ScreenProps & { id: string; onOpen: (id: string) => void; onBack: () => void }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [notes, setNotes] = useState('');
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<Provider>(snapshot.settings.provider);
  const [editor, setEditor] = useState<'brief' | 'notes'>('brief');
  const jobs = useJobs();
  const projectJobs = jobs.filter(job => job.projectId === id);
  const running = projectJobs.find(job => job.status === 'running');

  useEffect(() => {
    let active = true;
    setDetail(null); setLoadError('');
    void invoke<ProjectDetail>('projects.detail', { id }).then(project => {
      if (active) { setDetail(project); setBrief(project.brief); setNotes(project.notes); }
    }).catch(error => { if (active) setLoadError(errorMessage(error)); });
    return () => { active = false; };
  }, [id, reload]);

  useEffect(() => {
    let active = true;
    void invoke<ProjectDetail>('projects.detail', { id }).then(project => { if (active) setDetail(project); }).catch(error => { if (active) setLoadError(errorMessage(error)); });
    return () => { active = false; };
  }, [id, snapshot]);

  if (loadError) return <><button className="button ghost" onClick={onBack}><ArrowLeft size={16} />Projetos</button><ErrorNotice message={loadError} /><button className="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></>;
  if (!detail) return <Loading label="Abrindo projeto…" />;

  const project = detail;
  const visualAssets = project.assets.filter(asset => asset.kind === 'image' || asset.kind === 'video');
  const selected = project.assets.find(asset => asset.path === selectedPath) ?? visualAssets[0] ?? project.assets[0];
  const visualIndex = selected ? visualAssets.findIndex(asset => asset.path === selected.path) : -1;
  const approved = project.assets.filter(asset => asset.approved);
  const dirty = brief !== project.brief || notes !== project.notes;
  const brand = snapshot.brands.find(item => item.id === project.brandId);

  async function save() {
    await run('save-notes', async () => {
      await invoke('projects.notes', { id, notes, brief });
      setDetail(current => current ? { ...current, notes, brief } : current);
      await refresh();
    }, 'Briefing e notas salvos.');
  }
  async function importAsset() {
    await run('import-asset', async () => {
      const path = await invoke<string | undefined>('app.pick');
      if (!path) return;
      const result = await invoke<ProjectDetail>('projects.importAsset', { id, path });
      setDetail(result);
      setSelectedPath(result.assets.find(a => a.kind === 'image' || a.kind === 'video')?.path ?? result.assets[0]?.path ?? null);
    });
  }
  async function approve(asset: Asset) {
    const result = await run('approve', () => invoke<ProjectDetail>('projects.approve', { id, path: asset.path, approved: !asset.approved }));
    if (result) setDetail(result);
  }
  async function exportPackage() {
    await run('export', async () => {
      const destination = await invoke<string | undefined>('app.pick', { directory: true });
      if (!destination) return;
      const output = await invoke<string>('projects.export', { id, destination });
      if (await confirm('Pacote exportado', `Os arquivos aprovados foram exportados para ${output}. Deseja abrir a pasta?`, 'Abrir pasta')) await invoke('app.open', { path: output });
    });
  }
  async function derive(targetKind: Project['kind']) {
    if (!await confirm('Derivar um novo projeto', `Converter este projeto em um novo projeto de ${targetKind === 'image' ? 'imagem (PostNow)' : 'vídeo Reels 1080×1920 (VideoGo)'}? O projeto original será preservado.`, 'Criar derivação')) return;
    const result = await run('derive', () => invoke<Project>('projects.bridge', { id, kind: targetKind }), 'Projeto derivado com sucesso.');
    if (result) { await refresh(); onOpen(result.id); }
  }
  async function render() {
    const title = project.kind === 'image' ? 'Renderizar slides do carrossel' : 'Renderizar vídeo com VideoGo';
    const desc = project.kind === 'image'
      ? 'O motor PostNow gerará os slides em 1080×1350 dentro de generated/ aplicando a paleta, logo, fotos de referência e os textos de project.json.'
      : 'O motor VideoGo executará o storyboard e gerará o vídeo MP4 em renders/review/. Acompanhe a execução no terminal.';
    if (!await confirm(title, desc, 'Iniciar renderização')) return;
    const job = await run('render', () => invoke<Job>('projects.render', { id }), project.kind === 'image' ? 'Renderizando slides do carrossel…' : 'Renderizando vídeo…');
    if (job) {
      openJob(job);
      setSelectedPath(null);
    }
  }
  async function startAgent() {
    if (!await confirm(`Iniciar ${provider === 'codex' ? 'Codex' : 'Claude Code'}`, 'O agente lerá seu briefing, sua marca, as fotos/PDFs de referência e atualizará os arquivos deste projeto. Em projetos de imagem, os slides do carrossel serão renderizados automaticamente ao final.', 'Autorizar sessão')) return;
    const job = await run('agent', () => invoke<Job>('agents.start', { id, provider, prompt, confirm: true }), 'Sessão de IA iniciada.');
    if (job) { setPrompt(''); setSelectedPath(null); openJob(job); }
  }

  return (
    <>
      <div className="studio-breadcrumb">
        <button className="text-button" onClick={onBack}><ArrowLeft size={15} />Projetos</button>
        <span>/</span>
        <span>{project.title}</span>
      </div>

      <header className="studio-heading">
        <div>
          <div className="eyebrow">{project.kind === 'image' ? 'ESTÚDIO DE IMAGEM · POSTNOW' : 'ESTÚDIO DE VÍDEO · VIDEOGO'}{brand ? ` / ${brand.name}` : ''}</div>
          <h1>{project.title}</h1>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => { void run('open-project', () => invoke('app.open', { path: project.path })); }} disabled={busy.has('open-project')}>
            <FolderOpen size={16} />Abrir pasta
          </button>
          <button className="button primary" onClick={() => { void exportPackage(); }} disabled={!approved.length || busy.has('export')}>
            <Download size={16} />Exportar aprovados{approved.length > 0 && <span className="button-count">{approved.length}</span>}
          </button>
        </div>
      </header>

      <div className="studio-layout">
        <div className="studio-main">
          <section className="preview-panel">
            <div className="panel-heading">
              <h2><Layers size={16} />Prévia do conteúdo</h2>
              <div className="preview-toolbar">
                {visualAssets.length > 1 && visualIndex >= 0 && (
                  <div className="carousel-nav-pills">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Slide anterior"
                      disabled={visualIndex <= 0}
                      onClick={() => setSelectedPath(visualAssets[visualIndex - 1]!.path)}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="mono-note">{visualIndex + 1} / {visualAssets.length}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Próximo slide"
                      disabled={visualIndex >= visualAssets.length - 1}
                      onClick={() => setSelectedPath(visualAssets[visualIndex + 1]!.path)}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                )}
                <span className="muted">{project.assets.length} arquivo{project.assets.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="media-stage">
              {selected ? (
                <Media key={selected.path} projectId={project.id} asset={selected} />
              ) : (
                <Empty icon={project.kind === 'image' ? <Image /> : <Film />} title="Uma tela aberta às suas ideias">
                  Importe uma referência, clique em Renderizar Carrossel ou inicie uma sessão de IA.
                </Empty>
              )}
            </div>

            {selected && (
              <div className="asset-review">
                <div>
                  <strong title={selected.name}>{selected.name}</strong>
                  <span>{selected.approved ? 'Aprovado para exportação' : 'Aguardando sua revisão'}</span>
                </div>
                <button className={`button small ${selected.approved ? 'approved' : ''}`} disabled={busy.has('approve')} onClick={() => { void approve(selected); }}>
                  {selected.approved ? <CheckCheck size={15} /> : <Check size={15} />}
                  {selected.approved ? 'Remover aprovação' : 'Aprovar arquivo'}
                </button>
              </div>
            )}
          </section>

          <section className="assets-section">
            <div className="section-heading">
              <h2>Arquivos do projeto</h2>
              <div className="heading-actions">
                <button className="button small primary" disabled={busy.has('render') || Boolean(running)} onClick={() => { void render(); }}>
                  {project.kind === 'image' ? <WandSparkles size={15} /> : <Play size={15} />}
                  {project.kind === 'image' ? 'Renderizar Carrossel' : 'Renderizar Vídeo MP4'}
                </button>
                <button className="button small secondary" disabled={busy.has('import-asset')} onClick={() => { void importAsset(); }}>
                  <Plus size={15} />Importar arquivo
                </button>
              </div>
            </div>

            {project.assets.length ? (
              <div className="asset-strip">
                {project.assets.map(asset => (
                  <button
                    className={`asset-tile ${selected?.path === asset.path ? 'selected' : ''}`}
                    key={asset.path}
                    onClick={() => setSelectedPath(asset.path)}
                    aria-pressed={selected?.path === asset.path}
                  >
                    <div className="asset-thumbnail">
                      {asset.kind === 'image' ? (
                        <img src={asset.url} alt="" loading="lazy" />
                      ) : asset.kind === 'video' ? (
                        <Film size={24} className="icon-ok" />
                      ) : asset.kind === 'audio' ? (
                        <AudioLines size={24} className="icon-ok" />
                      ) : (
                        <FileText size={24} className="icon-ok" />
                      )}
                      {asset.approved && <span className="asset-check" aria-label="Aprovado"><Check size={12} /></span>}
                    </div>
                    <span title={asset.name}>{asset.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="inline-empty">Imagens, vídeos, áudios e documentos de referência, juntos no projeto.</p>
            )}
          </section>

          <section className="derive-bar">
            <div>
              <h3>{project.kind === 'image' ? 'Transformar carrossel em Vídeo Reels' : 'Transformar vídeo em Carrossel de Imagens'}</h3>
              <p>
                {project.kind === 'image'
                  ? 'Cria um novo projeto no VideoGo (1080×1920) a partir dos slides deste projeto, sem alterar o original.'
                  : 'Extrai os quadros deste vídeo para um novo projeto de carrossel no PostNow, sem alterar o original.'}
              </p>
            </div>
            <div className="heading-actions">
              {project.kind === 'image' ? (
                <button className="button small primary" disabled={busy.has('derive') || Boolean(running)} onClick={() => { void derive('video'); }}>
                  <Film size={15} />Converter em Vídeo (VideoGo)<ArrowRight size={14} />
                </button>
              ) : (
                <button className="button small primary" disabled={busy.has('derive') || Boolean(running)} onClick={() => { void derive('image'); }}>
                  <Image size={15} />Extrair Imagens (PostNow)<ArrowRight size={14} />
                </button>
              )}
            </div>
          </section>
        </div>

        <aside className="studio-side">
          <section className="editor-panel">
            <div className="editor-tabs">
              <button className={editor === 'brief' ? 'active' : ''} onClick={() => setEditor('brief')} aria-pressed={editor === 'brief'}>Briefing</button>
              <button className={editor === 'notes' ? 'active' : ''} onClick={() => setEditor('notes')} aria-pressed={editor === 'notes'}>Notas de direção</button>
            </div>
            <label className="sr-only" htmlFor="project-editor">{editor === 'brief' ? 'Briefing do projeto' : 'Notas de direção'}</label>
            <textarea
              id="project-editor"
              className="project-editor"
              rows={8}
              value={editor === 'brief' ? brief : notes}
              onChange={event => editor === 'brief' ? setBrief(event.target.value) : setNotes(event.target.value)}
              placeholder={editor === 'brief' ? 'Objetivo, público, formato e mensagem. Um bom briefing dá direção à criação.' : 'Registre ajustes, referências e decisões para a próxima sessão.'}
              maxLength={50000}
            />
            <div className="editor-footer">
              <span>{dirty ? 'Alterações não salvas' : 'Salvo no projeto'}</span>
              <button className="button small secondary" disabled={!dirty || busy.has('save-notes')} onClick={() => { void save(); }}>
                <Save size={14} />Salvar
              </button>
            </div>
          </section>

          <section className="composer-panel">
            <div className="panel-heading">
              <h2><Sparkles size={17} />Assistente de criação</h2>
              <span className="badge">IA</span>
            </div>
            <p>Você dirige. O agente estrutura o roteiro/slides e renderiza o carrossel no contexto deste projeto.</p>
            <label>
              Provedor
              <select value={provider} onChange={event => setProvider(event.target.value as Provider)} disabled={Boolean(running) || busy.has('agent')}>
                <option value="codex">OpenAI Codex</option>
                <option value="claude">Anthropic Claude Code</option>
              </select>
            </label>
            <label htmlFor="agent-prompt">O que vamos criar?</label>
            <textarea
              id="agent-prompt"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              rows={5}
              maxLength={20000}
              placeholder="Ex.: Crie um carrossel de 5 páginas falando de forma leve sobre divórcio com CTA final…"
              disabled={Boolean(running) || busy.has('agent')}
            />
            {dirty && <p className="field-help warning-text">Salve o briefing e as notas antes de iniciar para incluir suas alterações.</p>}
            <button className="button primary full" disabled={!prompt.trim() || Boolean(running) || busy.has('agent') || dirty} onClick={() => { void startAgent(); }}>
              <Send size={16} />{running ? 'Sessão em andamento…' : 'Gerar com IA'}
            </button>
            <p className="composer-footnote"><TerminalSquare size={13} />Acompanhe o progresso ao vivo no console.</p>
          </section>

          {projectJobs.length > 0 && (
            <section>
              <div className="section-heading"><h2>Neste projeto</h2></div>
              {projectJobs.slice(0, 3).map(job => <ActivityCard key={job.id} job={job} onOpen={openJob} />)}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
