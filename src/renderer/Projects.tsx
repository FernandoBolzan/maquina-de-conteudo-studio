import { useState, type FormEvent } from 'react';
import { ArrowRight, Film, FolderInput, Image, Plus, Search, Shapes } from 'lucide-react';
import type { Project } from '../shared/contracts';
import { Empty, Modal, PageHeading } from './components';
import { invoke, shortDate, useJobs, type ScreenProps } from './state';
import { ActivityCard } from './Console';

export function Projects({ snapshot, run, refresh, busy, openJob, onOpen }: ScreenProps & { onOpen: (id: string) => void }) {
  const [create, setCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Project['kind']>('image');
  const [brandId, setBrandId] = useState('');
  const [brief, setBrief] = useState('');
  const jobs = useJobs();
  const projects = snapshot.projects.filter(project => (filter === 'all' || project.kind === filter) && project.title.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));

  function openCreate(presetKind: Project['kind']) {
    setKind(presetKind);
    setCreate(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await run('create', () => invoke<Project>('projects.create', { title, kind, brandId: brandId || undefined, brief }));
    if (result) { setCreate(false); setTitle(''); setBrief(''); await refresh(); onOpen(result.id); }
  }
  async function importProject() {
    await run('import-project', async () => {
      const path = await invoke<string | undefined>('app.pick', { directory: true });
      if (!path) return;
      const project = await invoke<Project>('projects.import', { path });
      await refresh();
      onOpen(project.id);
    });
  }

  return (
    <>
      <PageHeading
        eyebrow="WORKBENCH DE PRODUÇÃO · POSTNOW + VIDEOGO"
        title="Projetos"
        description="Escolha entre criar lote de imagens no PostNow ou vídeo no VideoGo, ou converta um projeto em outro."
        actions={
          <>
            <button type="button" className="button secondary" onClick={() => { void importProject(); }} disabled={busy.has('import-project')}>
              <FolderInput size={16} />Importar pasta
            </button>
            <button type="button" className="button primary" onClick={() => openCreate('image')}>
              <Plus size={16} />Novo projeto
            </button>
          </>
        }
      />

      <section className="engine-launcher-bar" aria-label="Criar por motor">
        <button type="button" className="launcher-tile" onClick={() => openCreate('image')}>
          <img className="track-icon" src="./maquina/img/icon-postnow.webp" alt="" width="42" height="42" />
          <div>
            <span className="launcher-tag">POSTNOW · CODEX</span>
            <strong>Novo Projeto de Imagem / Carrossel</strong>
            <small>Feed, carrossel até 10 slides, Stories e capas na identidade da marca</small>
          </div>
          <ArrowRight size={16} className="launcher-arrow" />
        </button>

        <button type="button" className="launcher-tile" onClick={() => openCreate('video')}>
          <img className="track-icon" src="./maquina/img/icon-videogo.webp" alt="" width="42" height="42" />
          <div>
            <span className="launcher-tag">VIDEOGO · CLAUDE CODE</span>
            <strong>Novo Projeto de Vídeo / Reels</strong>
            <small>Storyboard v1, motion 2D/3D, cortes 1080×1920 e render MP4 local</small>
          </div>
          <ArrowRight size={16} className="launcher-arrow" />
        </button>
      </section>

      <div className="library-toolbar">
        <div className="studio-styles" role="group" aria-label="Filtrar projetos">
          {[['all', `Todos (${snapshot.projects.length})`], ['image', 'Imagens · PostNow'], ['video', 'Vídeos · VideoGo']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} className={`studio-chip ${filter === value ? 'active' : ''}`} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={15} />
          <span className="sr-only">Buscar projetos</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filtrar projetos por nome…" />
        </label>
      </div>

      {projects.length === 0 ? (
        <Empty icon={<Shapes />} title={snapshot.projects.length ? 'Nenhum projeto encontrado para este filtro' : 'Nenhum projeto no workspace'} action={!snapshot.projects.length && <button className="button primary" onClick={() => openCreate('image')}><Plus size={16} />Criar primeiro projeto</button>}>
          {snapshot.projects.length ? 'Experimente outro nome ou filtro.' : 'Inicie um projeto de imagem (PostNow) ou de vídeo (VideoGo) para abrir o estúdio.'}
        </Empty>
      ) : (
        <div className="project-grid">
          {projects.map(project => {
            const brand = snapshot.brands.find(item => item.id === project.brandId);
            return (
              <button type="button" className="project-card" key={project.id} onClick={() => onOpen(project.id)}>
                <div className={`project-cover ${project.kind}`}>
                  <span className="cover-symbol">{project.kind === 'image' ? <Image size={26} strokeWidth={1.6} /> : <Film size={26} strokeWidth={1.6} />}</span>
                  <span className="post-type-tag">{project.kind === 'image' ? '▧ POSTNOW · IMAGEM' : '▷ VIDEOGO · VÍDEO'}</span>
                </div>
                <div className="project-card-body">
                  <div className="project-meta">
                    <span>{brand?.name || 'Sem marca'}</span>
                    <time dateTime={project.createdAt}>{shortDate(project.createdAt)}</time>
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.brief || 'Sem briefing cadastrado.'}</p>
                  <div className="project-footer">
                    <span>{project.sourceProjectId ? 'Derivado por FFmpeg' : 'Projeto nativo'}</span>
                    <span className="open-studio-label">Abrir <ArrowRight size={13} /></span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {jobs.length > 0 && (
        <section className="recent-activity">
          <div className="section-heading">
            <h2>Processos recentes</h2>
            <span className="muted">Clique para abrir no terminal</span>
          </div>
          <div className="activity-grid">{jobs.slice(0, 3).map(job => <ActivityCard key={job.id} job={job} onOpen={openJob} />)}</div>
        </section>
      )}

      {create && (
        <Modal title="Novo projeto" onClose={() => { if (!busy.has('create')) setCreate(false); }}>
          <form onSubmit={event => { void submit(event); }}>
            <fieldset disabled={busy.has('create')}>
              <label>Nome do projeto<input autoFocus value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} placeholder="Ex.: Carrossel Coolify v4.5 ou Reels Lançamento" /></label>
              <div className="form-row">
                <label>Motor / Formato
                  <select value={kind} onChange={event => setKind(event.target.value as Project['kind'])}>
                    <option value="image">Imagem · PostNow</option>
                    <option value="video">Vídeo · VideoGo</option>
                  </select>
                </label>
                <label>Marca
                  <select value={brandId} onChange={event => setBrandId(event.target.value)}>
                    <option value="">Sem marca</option>
                    {snapshot.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                  </select>
                </label>
              </div>
              <label>Briefing da pauta<textarea rows={4} value={brief} onChange={event => setBrief(event.target.value)} maxLength={20000} placeholder="Objetivo, público e chamada final da pauta." /></label>
              <p className="field-help">Salvo localmente no workspace configurado.</p>
              <div className="modal-actions">
                <button className="button secondary" type="button" onClick={() => setCreate(false)}>Cancelar</button>
                <button className="button primary" type="submit">{busy.has('create') ? 'Criando…' : 'Criar projeto'}<ArrowRight size={16} /></button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </>
  );
}
