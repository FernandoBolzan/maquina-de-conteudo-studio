import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Film, FolderInput, Image, Layers, Monitor, Plus, Search, Shapes, Smartphone, Square } from 'lucide-react';
import type { Project, ProjectFormatId } from '../shared/contracts';
import { DEFAULT_POSTNOW_FORMAT, POSTNOW_FORMATS, imageAspectOptions, isPostNowFormat, postNowFormatFor, videoAspectOptions, type ImageAspect } from '../shared/formats';
import { Empty, Modal, PageHeading } from './components';
import { invoke, shortDate, useJobs, type ScreenProps } from './state';
import { ActivityCard } from './Console';
import { PROMPT_RECIPES, composeProjectBrief, composePrompt, interpolatePrompt, loadPromptLibrary, promptRecipesFor, suggestProjectTitle, type PromptInputs } from './prompt-library';
import './projects-cards.css';

type CreateStep = 'engine' | 'briefing';

interface DeletionPreview {
  projectId: string;
  title: string;
  folder: string;
  files: number;
  bytes: number;
  sessions: number;
  nativeCopies: number;
  preservedNativeCopies: number;
}

const firstPrompt = (kind: Project['kind']) => PROMPT_RECIPES.find(recipe => recipe.kind === kind)?.id ?? 'custom';
const defaultFormat = (kind: Project['kind']): ProjectFormatId => kind === 'image' ? DEFAULT_POSTNOW_FORMAT : 'reels';

export function Projects({ snapshot, run, refresh, busy, openJob, onOpen, initialKind, onInitialKindConsumed }: ScreenProps & { onOpen: (id: string, initialPrompt?: string) => void; initialKind: Project['kind'] | null; onInitialKindConsumed: () => void }) {
  const [create, setCreate] = useState(initialKind !== null);
  const [createStep, setCreateStep] = useState<CreateStep>(initialKind ? 'briefing' : 'engine');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [kind, setKind] = useState<Project['kind']>(initialKind ?? 'image');
  const [format, setFormat] = useState<ProjectFormatId>(defaultFormat(initialKind ?? 'image'));
  const [pageCount, setPageCount] = useState(5);
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [audience, setAudience] = useState('Público geral');
  const [tone, setTone] = useState('Claro e curioso');
  const [callToAction, setCallToAction] = useState('Salve e compartilhe');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [brandId, setBrandId] = useState('');
  const [promptChoice, setPromptChoice] = useState(firstPrompt(initialKind ?? 'image'));
  const [promptText, setPromptText] = useState('');
  const [deletion, setDeletion] = useState<DeletionPreview | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [baseProject, setBaseProject] = useState<Project | null>(null);
  const [cloneTitle, setCloneTitle] = useState('');
  const [cloneKind, setCloneKind] = useState<Project['kind']>('image');
  const titleSuggestion = useRef('');
  const promptLibrary = useMemo(() => loadPromptLibrary(window.localStorage), []);
  const jobs = useJobs();

  const isCarousel = format.startsWith('carousel-');
  const promptInputs: PromptInputs = { topic, audience, tone, callToAction, format, ...(kind === 'image' && isCarousel ? { pageCount } : {}) };
  const recipes = promptRecipesFor(kind, isCarousel);
  const matchingRecipe = recipes.find(recipe => recipe.id === promptChoice);
  const matchingPersonalPrompt = promptLibrary.personal.find(prompt => prompt.id === promptChoice && prompt.kind === kind);
  const promptSelectValue = promptChoice === 'custom' || matchingRecipe || matchingPersonalPrompt ? promptChoice : 'custom';
  const personalPrompts = promptLibrary.personal.filter(prompt => prompt.kind === kind);
  const projects = snapshot.projects.filter(project => (filter === 'all' || project.kind === filter) && project.title.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));

  useEffect(() => {
    if (!initialKind) return;
    setKind(initialKind);
    setFormat(defaultFormat(initialKind));
    setPromptChoice(firstPrompt(initialKind));
    setCreateStep('briefing');
    setCreate(true);
    onInitialKindConsumed();
  }, [initialKind, onInitialKindConsumed]);

  useEffect(() => {
    if (createStep !== 'briefing' || promptChoice === 'custom') return;
    if (matchingRecipe) setPromptText(composePrompt(matchingRecipe, promptInputs));
    else if (matchingPersonalPrompt) setPromptText(interpolatePrompt(matchingPersonalPrompt.prompt, promptInputs));
    else if (PROMPT_RECIPES.some(recipe => recipe.id === promptChoice)) {
      // A recipe that is no longer offered (e.g. single-image mode) falls back to custom.
      setPromptChoice('custom');
      setPromptText('');
    }
    else setPromptText('');
  }, [createStep, kind, matchingPersonalPrompt, matchingRecipe, promptChoice, topic, audience, tone, callToAction, format, pageCount, isCarousel]);

  function chooseKind(next: Project['kind']) {
    setKind(next);
    setFormat(defaultFormat(next));
    setPromptChoice(firstPrompt(next));
    setPromptText('');
    if (!titleEdited) {
      const suggested = suggestProjectTitle(next, topic);
      titleSuggestion.current = suggested;
      setTitle(suggested);
    }
  }

  function openCreate(presetKind: Project['kind']) {
    chooseKind(presetKind);
    setCreateStep('briefing');
    setCreate(true);
  }

  function resetCreate() {
    setCreate(false);
    setCreateStep('engine');
    setTopic('');
    setTitle('');
    setTitleEdited(false);
    titleSuggestion.current = '';
    setAudience('Público geral');
    setTone('Claro e curioso');
    setCallToAction('Salve e compartilhe');
    setAdditionalNotes('');
    setFormat(defaultFormat(kind));
    setPageCount(5);
    setBrandId('');
    setPromptText('');
    setPromptChoice(firstPrompt(kind));
  }

  function changeTopic(value: string) {
    setTopic(value);
    if (!titleEdited) {
      const suggested = suggestProjectTitle(kind, value);
      titleSuggestion.current = suggested;
      setTitle(suggested);
    }
  }

  function selectPrompt(value: string) {
    setPromptChoice(value);
    if (value === 'custom') setPromptText('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const brief = composeProjectBrief(promptInputs, additionalNotes);
    const result = await run('create', () => invoke<Project>('projects.create', { title, kind, format, brandId: brandId || undefined, brief, ...(kind === 'image' && isCarousel ? { pageCount } : {}) }));
    if (result) {
      const initialPrompt = promptText.trim();
      resetCreate();
      await refresh();
      onOpen(result.id, initialPrompt);
    }
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

  async function previewDelete(project: Project) {
    const preview = await run('delete-preview', () => invoke<DeletionPreview>('projects.deletePreview', { id: project.id }));
    if (preview) {
      setConfirmTitle('');
      setDeletion(preview);
    }
  }

  async function deleteProject(event: FormEvent) {
    event.preventDefault();
    if (!deletion || confirmTitle !== deletion.title) return;
    const result = await run('delete-project', () => invoke<{ deleted: true; id: string }>('projects.delete', {
      id: deletion.projectId, confirm: true, confirmTitle,
    }), 'Projeto excluído permanentemente.');
    if (result) {
      setDeletion(null);
      setConfirmTitle('');
      await refresh();
    }
  }

  function openClone(project: Project) {
    setBaseProject(project);
    setCloneKind(project.kind);
    setCloneTitle(`${project.title.slice(0, 192)} — cópia`);
  }

  async function cloneProject(event: FormEvent) {
    event.preventDefault();
    if (!baseProject || !cloneTitle.trim()) return;
    const result = await run('clone-project', () => invoke<Project>('projects.clone', {
      id: baseProject.id, title: cloneTitle, kind: cloneKind,
    }), 'Projeto criado a partir das diretrizes.');
    if (result) {
      setBaseProject(null);
      await refresh();
      onOpen(result.id);
    }
  }

  const imageOptions = imageAspectOptions();
  const imageAspect: ImageAspect = isPostNowFormat(format) ? POSTNOW_FORMATS[format].aspect : POSTNOW_FORMATS[DEFAULT_POSTNOW_FORMAT].aspect;
  const imageOption = imageOptions.find(option => option.aspect === imageAspect)!;
  function selectImageAspect(aspect: ImageAspect) {
    const option = imageOptions.find(item => item.aspect === aspect)!;
    setFormat(isCarousel && option.carousel ? option.carousel : option.single);
  }
  function selectImageMode(carousel: boolean) {
    const next = postNowFormatFor(imageAspect, carousel);
    if (next) setFormat(next);
  }
  return (
    <>
      <div className="projects-heading">
      <PageHeading
        eyebrow="WORKBENCH DE PRODUÇÃO · POSTNOW + VIDEOGO"
        title="Projetos"
        description="Sua biblioteca de imagens e vídeos, organizada por projeto. Escolha uma trilha para começar ou retome uma criação."
        actions={
          <>
            <button type="button" className="button secondary" onClick={() => { void importProject(); }} disabled={busy.has('import-project')}>
              <FolderInput size={16} />Importar pasta
            </button>
            <button type="button" className="button primary" onClick={() => { setCreateStep('engine'); setCreate(true); }}>
              <Plus size={16} />Criar conteúdo
            </button>
          </>
        }
      />
      </div>

      <div className="projects-section-intro">
        <div><span className="projects-kicker">CRIAR</span><h2>O que você vai produzir?</h2></div>
        <span>Escolha uma trilha para começar</span>
      </div>
      <section className="engine-launcher-bar projects-launcher" aria-label="Criar por motor">
        <button type="button" className="launcher-tile" onClick={() => openCreate('image')}>
          <img className="track-icon" src="./maquina/img/icon-postnow.webp" alt="" width="42" height="42" />
          <div>
            <span className="launcher-tag">POSTNOW · MOTOR DE IMAGEM</span>
            <strong>Criar post ou carrossel</strong>
            <small>Feed, carrossel até 10 slides, Stories e capas na identidade da marca</small>
          </div>
          <ArrowRight size={16} className="launcher-arrow" />
        </button>

        <button type="button" className="launcher-tile" onClick={() => openCreate('video')}>
          <img className="track-icon" src="./maquina/img/icon-videogo.webp" alt="" width="42" height="42" />
          <div>
            <span className="launcher-tag">VIDEOGO · MOTOR DE VÍDEO</span>
            <strong>Criar vídeo ou Reels</strong>
            <small>Storyboard, voz opcional e vídeo vertical renderizado pelo VideoGo</small>
          </div>
          <ArrowRight size={16} className="launcher-arrow" />
        </button>
      </section>

      <section className="projects-library" aria-labelledby="projects-library-title">
      <div className="projects-library-heading">
        <div><span className="projects-kicker">SEU WORKSPACE</span><h2 id="projects-library-title">Biblioteca de projetos</h2></div>
        <span className="projects-result-count" aria-live="polite">{projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}</span>
      </div>

      <div className="library-toolbar projects-toolbar">
        <div className="studio-styles projects-filters" role="group" aria-label="Filtrar projetos">
          {[['all', 'Todos'], ['image', 'Imagens · PostNow'], ['video', 'Vídeos · VideoGo']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} className={`studio-chip ${filter === value ? 'active' : ''}`} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <label className="search-field projects-search">
          <Search size={15} />
          <span className="sr-only">Buscar projetos</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filtrar projetos por nome…" />
        </label>
      </div>

      {projects.length === 0 ? (
        snapshot.projects.length ? (
          <Empty icon={<Shapes />} title="Nenhum projeto encontrado para este filtro">Experimente outro nome ou filtro.</Empty>
        ) : (
          <Empty icon={<Shapes />} title="Nenhum projeto no workspace" action={
            <span className="empty-project-actions">
              <button className="button secondary" onClick={() => openCreate('image')}><Image size={16} />Começar no PostNow</button>
              <button className="button primary" onClick={() => openCreate('video')}><Film size={16} />Começar no VideoGo</button>
            </span>
          }>
            Escolha o que quer produzir. Você pode configurar marca e voz depois; projetos são criados com um nome legível baseado no assunto.
          </Empty>
        )
      ) : (
        <div className="project-grid projects-grid">
          {projects.map(project => {
            const brand = snapshot.brands.find(item => item.id === project.brandId);
            const processing = jobs.some(job => job.status === 'running' && job.projectId === project.id);
            return (
              <div key={project.id} className="projects-item">
              <button type="button" className="project-card projects-card" onClick={() => onOpen(project.id)}>
                <div className={`project-cover ${project.kind}`}>
                  {project.coverUrl && <img key={project.coverUrl} className="project-cover-image" src={project.coverUrl} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
                  <span className="cover-symbol" aria-hidden="true">{project.kind === 'image' ? <Image size={24} strokeWidth={1.5} /> : <Film size={24} strokeWidth={1.5} />}<span>Capa ainda não disponível</span></span>
                  <span className="post-type-tag">{project.kind === 'image' ? 'POSTNOW · IMAGEM' : 'VIDEOGO · VÍDEO'}</span>
                </div>
                <div className="project-card-body">
                  <div className="project-meta">
                    <span>{brand?.name || 'Sem marca'}</span>
                    <time dateTime={project.createdAt}>{shortDate(project.createdAt)}</time>
                  </div>
                  {processing && <span className="project-processing">Processando</span>}
                  <h2>{project.title}</h2>
                  <p>{project.brief || 'Sem briefing cadastrado.'}</p>
                  <div className="project-footer">
                    <span>{project.sourceProjectId ? 'Projeto derivado' : 'Projeto nativo'}</span>
                    <span className="open-studio-label">Abrir <ArrowRight size={13} /></span>
                  </div>
                </div>
              </button>
              <div className="card-actions projects-card-actions">
                <button type="button" className="button secondary button-small" aria-label={`Usar ${project.title} como base`} onClick={() => openClone(project)}>Usar como base</button>
                <button type="button" className="button secondary button-small" aria-label={`Excluir ${project.title}`} disabled={busy.has('delete-preview')} onClick={() => { void previewDelete(project); }}>Excluir</button>
              </div>
              </div>
            );
          })}
        </div>
      )}
      </section>

      {jobs.length > 0 && (
        <section className="recent-activity">
          <div className="section-heading">
            <h2>Processos recentes</h2>
            <span className="muted">Clique para ver a atividade</span>
          </div>
          <div className="activity-grid">{jobs.slice(0, 3).map(job => <ActivityCard key={job.id} job={job} onOpen={openJob} />)}</div>
        </section>
      )}

      {deletion && (
        <Modal title="Excluir projeto permanentemente" onClose={() => { if (!busy.has('delete-project')) setDeletion(null); }}>
          <form onSubmit={event => { void deleteProject(event); }}>
            <fieldset disabled={busy.has('delete-project')}>
              <p>Esta ação não pode ser desfeita. Serão removidos o registro e a pasta do projeto, incluindo mídias, aprovações e arquivos gerados, além das sessões e cópias nativas identificadas.</p>
              <p>Pasta: <strong>{deletion.folder}</strong></p>
              <p>Na pasta: {deletion.files} arquivo(s), {new Intl.NumberFormat('pt-BR').format(deletion.bytes)} bytes. Também serão removidas {deletion.sessions} sessão(ões) e {deletion.nativeCopies} cópia(s) nativa(s).</p>
              <p>Marcas compartilhadas, vozes, motores e exportações externas serão preservados.</p>
              {deletion.preservedNativeCopies > 0 && <p role="status">{deletion.preservedNativeCopies} possível(is) cópia(s) nativa(s) serão preservadas porque não foi possível comprovar que pertencem a este projeto.</p>}
              <label>Digite exatamente o nome do projeto para confirmar: <strong>{deletion.title}</strong>
                <input autoFocus value={confirmTitle} onChange={event => setConfirmTitle(event.target.value)} required autoComplete="off" />
              </label>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setDeletion(null)}>Cancelar</button>
                <button type="submit" className="button danger" disabled={confirmTitle !== deletion.title}>{busy.has('delete-project') ? 'Excluindo…' : 'Excluir permanentemente'}</button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {baseProject && (
        <Modal title="Usar projeto como base" onClose={() => { if (!busy.has('clone-project')) setBaseProject(null); }}>
          <form onSubmit={event => { void cloneProject(event); }}>
            <fieldset disabled={busy.has('clone-project')}>
              <p>Crie um projeto novo a partir de <strong>{baseProject.title}</strong>. Briefing, marca e notas são mantidos; diretrizes específicas do motor são copiadas quando o motor é o mesmo.</p>
              <p>Mídias, textos produzidos, alegações, aprovações, áudio e logs não são copiados. O projeto original permanece intacto.</p>
              <label>Nome do novo projeto
                <input autoFocus value={cloneTitle} onChange={event => setCloneTitle(event.target.value)} required maxLength={200} />
              </label>
              <label>Motor do novo projeto
                <select value={cloneKind} onChange={event => setCloneKind(event.target.value as Project['kind'])}>
                  <option value="image">PostNow · imagem</option>
                  <option value="video">VideoGo · vídeo</option>
                </select>
              </label>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setBaseProject(null)}>Cancelar</button>
                <button type="submit" className="button primary" disabled={!cloneTitle.trim()}>{busy.has('clone-project') ? 'Criando…' : 'Criar projeto'}</button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {create && (
        <Modal title={createStep === 'engine' ? 'Escolha onde criar' : `Novo projeto · ${kind === 'image' ? 'PostNow' : 'VideoGo'}`} onClose={() => { if (!busy.has('create')) resetCreate(); }} wide className="project-create-modal">
          {createStep === 'engine' ? (
            <div className="create-engine-step">
              <p className="create-engine-subtitle">Selecione o motor de criação para o seu novo conteúdo:</p>
              <div className="create-engine-options">
                <button type="button" className="create-engine-card postnow" onClick={() => openCreate('image')}>
                  <div className="engine-card-header">
                    <div className="engine-card-icon-wrap">
                      <img src="./maquina/img/icon-postnow.webp" alt="PostNow" width="44" height="44" />
                    </div>
                    <div className="engine-card-badge">POSTNOW · MOTOR DE IMAGEM</div>
                  </div>
                  <h3 className="engine-card-title">Post, Carrossel & Imagens</h3>
                  <p className="engine-card-desc">Formatos para Feed Instagram e LinkedIn (4:5, 1:1, Story 9:16). Aplicação de marca oficial e validação de arte.</p>
                  <div className="engine-card-features">
                    <span className="feature-pill">Feed 4:5 vertical</span>
                    <span className="feature-pill">Carrossel 3-10 slides</span>
                    <span className="feature-pill">Quadrado 1:1</span>
                    <span className="feature-pill">Marca e Logo</span>
                  </div>
                  <div className="engine-card-action">
                    <span>Criar imagens</span>
                    <ArrowRight size={16} />
                  </div>
                </button>

                <button type="button" className="create-engine-card videogo" onClick={() => openCreate('video')}>
                  <div className="engine-card-header">
                    <div className="engine-card-icon-wrap">
                      <img src="./maquina/img/icon-videogo.webp" alt="VideoGo" width="44" height="44" />
                    </div>
                    <div className="engine-card-badge is-accent">VIDEOGO · MOTOR DE VÍDEO</div>
                  </div>
                  <h3 className="engine-card-title">Vídeo, Reels & Shorts</h3>
                  <p className="engine-card-desc">Roteiro e storyboard com IA, narração de voz com ElevenLabs ou áudio próprio, motion graphics e render em 9:16 ou 16:9.</p>
                  <div className="engine-card-features">
                    <span className="feature-pill">Reels / Shorts 9:16</span>
                    <span className="feature-pill">YouTube 16:9</span>
                    <span className="feature-pill">Voz ElevenLabs</span>
                    <span className="feature-pill">Render sem HUD</span>
                  </div>
                  <div className="engine-card-action">
                    <span>Criar vídeo</span>
                    <ArrowRight size={16} />
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={event => { void submit(event); }}>
              <fieldset disabled={busy.has('create')}>
                <div className="creation-track-header">
                  <div className="creation-track-info">
                    <span className="creation-track-badge">
                      {kind === 'image' ? <Image size={14} /> : <Film size={14} />}
                      {kind === 'image' ? 'TRILHA POSTNOW · IMAGENS' : 'TRILHA VIDEOGO · VÍDEO'}
                    </span>
                    <p>{kind === 'image' ? 'Defina o formato e a pauta. O PostNow estrutura os slides e aplica a identidade visual da marca.' : 'Defina formato, tema e briefing. O VideoGo prepara o roteiro e storyboard no Studio com IA.'}</p>
                  </div>
                  <button className="button secondary button-small" type="button" onClick={() => setCreateStep('engine')}>
                    <ArrowLeft size={14} />Trocar motor
                  </button>
                </div>

                <div className="form-section">
                  <div className="form-section-head">
                    <span className="section-number">1</span>
                    <h4>Formato & Enquadramento</h4>
                  </div>

                  {kind === 'image' ? (
                    <div className="format-selection-section">
                      <div className="format-section-label">
                        <span>Proporção da imagem</span>
                        <small>Selecione a proporção das artes para a sua rede social principal</small>
                      </div>
                      <div className="format-cards-grid">
                        {imageOptions.map(option => {
                          const isSelected = imageAspect === option.aspect;
                          const details = option.aspect === '4:5'
                            ? { dim: '1080 × 1350', badge: 'Recomendado', use: 'Feed Instagram e LinkedIn' }
                            : option.aspect === '1:1'
                            ? { dim: '1080 × 1080', badge: 'Quadrado', use: 'Feed clássico' }
                            : { dim: '1080 × 1920', badge: 'Vertical', use: 'Stories e tela cheia' };
                          return (
                            <button
                              key={option.aspect}
                              type="button"
                              className={`format-card ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => selectImageAspect(option.aspect)}
                            >
                              <div className="format-card-top">
                                <span className={`ratio-box ratio-${option.aspect.replace(':', '-')}`}>
                                  {option.aspect === '4:5' && <Square size={13} style={{ transform: 'scale(0.85, 1.1)' }} />}
                                  {option.aspect === '1:1' && <Square size={14} />}
                                  {option.aspect === '9:16' && <Smartphone size={14} />}
                                </span>
                                <span className="format-card-badge">{details.badge}</span>
                                <span className={`radio-dot ${isSelected ? 'is-checked' : ''}`} />
                              </div>
                              <div className="format-card-info">
                                <span className="format-card-title">{option.label}</span>
                                <span className="format-card-dim">{details.dim}</span>
                                <small className="format-card-use">{details.use}</small>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="format-section-label" style={{ marginTop: '14px' }}>
                        <span>Tipo de publicação</span>
                      </div>
                      <div className="quantity-toggle-group">
                        <button
                          type="button"
                          className={`quantity-card ${!isCarousel ? 'is-selected' : ''}`}
                          onClick={() => selectImageMode(false)}
                        >
                          <Image size={18} />
                          <div>
                            <strong>Imagem única</strong>
                            <small>Post individual ou Story único</small>
                          </div>
                          <span className={`radio-dot ${!isCarousel ? 'is-checked' : ''}`} />
                        </button>
                        <button
                          type="button"
                          className={`quantity-card ${isCarousel ? 'is-selected' : ''} ${!imageOption.carousel ? 'is-disabled' : ''}`}
                          disabled={!imageOption.carousel}
                          onClick={() => selectImageMode(true)}
                          title={!imageOption.carousel ? 'Stories não suportam carrossel' : undefined}
                        >
                          <Layers size={18} />
                          <div>
                            <strong>Carrossel de slides</strong>
                            <small>Sequência de 3 a 10 slides</small>
                          </div>
                          <span className={`radio-dot ${isCarousel ? 'is-checked' : ''}`} />
                        </button>
                      </div>

                      {isCarousel && (
                        <div className="carousel-page-selector">
                          <div className="page-selector-header">
                            <label htmlFor="carousel-pages">Quantidade de slides:</label>
                            <span className="page-count-badge">{pageCount} slides</span>
                          </div>
                          <div className="page-pills">
                            {[3, 4, 5, 7, 10].map(count => (
                              <button
                                key={count}
                                 type="button"
                                className={`page-pill ${pageCount === count ? 'is-active' : ''}`}
                                onClick={() => setPageCount(count)}
                              >
                                {count} {count === 5 ? '(Padrão)' : 'slides'}
                              </button>
                            ))}
                            <div className="page-input-wrap">
                              <span>Outro:</span>
                              <input
                                id="carousel-pages"
                                type="number"
                                min={3}
                                max={10}
                                step={1}
                                value={pageCount}
                                onChange={event => setPageCount(Number(event.target.value))}
                                required
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="format-selection-section">
                      <div className="format-section-label">
                        <span>Proporção do vídeo</span>
                        <small>Escolha o enquadramento principal do vídeo</small>
                      </div>
                      <div className="format-cards-grid">
                        {videoAspectOptions().map(option => {
                          if (!option.available) return null;
                          const isSelected = option.format === format || (option.format === 'story' && format === 'reels');
                          const details = option.aspect === '9:16'
                            ? { dim: '1080 × 1920', badge: 'Recomendado', use: 'Reels, TikTok & Shorts' }
                            : option.aspect === '1:1'
                            ? { dim: '1080 × 1080', badge: 'Quadrado', use: 'Feed Instagram e LinkedIn' }
                            : { dim: '1920 × 1080', badge: 'Widescreen', use: 'YouTube e Desktop' };
                          return (
                            <button
                              key={option.aspect}
                              type="button"
                              className={`format-card ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => setFormat(option.format)}
                            >
                              <div className="format-card-top">
                                <span className={`ratio-box ratio-${option.aspect.replace(':', '-')}`}>
                                  {option.aspect === '9:16' && <Smartphone size={14} />}
                                  {option.aspect === '1:1' && <Square size={14} />}
                                  {option.aspect === '16:9' && <Monitor size={14} />}
                                </span>
                                <span className="format-card-badge">{details.badge}</span>
                                <span className={`radio-dot ${isSelected ? 'is-checked' : ''}`} />
                              </div>
                              <div className="format-card-info">
                                <span className="format-card-title">{option.label}</span>
                                <span className="format-card-dim">{details.dim}</span>
                                <small className="format-card-use">{details.use}</small>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="field-help" style={{ marginTop: '8px' }}>
                        Dica: Vídeos em 9:16 vertical enquadram perfeitamente na área segura 4:5 do feed do Instagram.
                      </p>
                    </div>
                  )}
                </div>

                <div className="form-section">
                  <div className="form-section-head">
                    <span className="section-number">2</span>
                    <h4>Pauta & Identificação</h4>
                  </div>
                  <label className="field-group">
                    <span className="field-title">Qual é o assunto ou tema central? <span className="req">*</span></span>
                    <input
                      className="input-prominent"
                      value={topic}
                      onChange={event => changeTopic(event.target.value)}
                      required
                      maxLength={2000}
                      placeholder={kind === 'image' ? 'Ex.: 5 direitos do consumidor que poucos conhecem' : 'Ex.: por que as abelhas dançam para indicar flores'}
                    />
                  </label>

                  <label className="field-group">
                    <span className="field-title">Nome do projeto <small className="field-sub">(identifica a pasta no disco)</small></span>
                    <input
                      value={title}
                      onChange={event => {
                        const value = event.target.value;
                        setTitle(value);
                        setTitleEdited(value !== titleSuggestion.current);
                      }}
                      required
                      maxLength={200}
                      placeholder={kind === 'image' ? 'Carrossel — assunto' : 'Vídeo — assunto'}
                    />
                  </label>
                </div>

                <div className="form-section">
                  <div className="form-section-head">
                    <span className="section-number">3</span>
                    <h4>Audiência, Tom & Marca</h4>
                  </div>
                  <div className="form-row-2col">
                    <label className="field-group">
                      <span className="field-title">Público-alvo</span>
                      <input value={audience} onChange={event => setAudience(event.target.value)} maxLength={500} placeholder="Ex.: Público geral, estudantes, clientes" />
                    </label>
                    <label className="field-group">
                      <span className="field-title">Tom de voz</span>
                      <input value={tone} onChange={event => setTone(event.target.value)} maxLength={300} placeholder="Ex.: Claro e curioso, acolhedor, assertivo" />
                    </label>
                  </div>
                  <div className="form-row-2col">
                    <label className="field-group">
                      <span className="field-title">Chamada final (CTA)</span>
                      <input value={callToAction} onChange={event => setCallToAction(event.target.value)} maxLength={300} placeholder="Ex.: Salve e compartilhe, Deixe sua dúvida" />
                    </label>
                    <label className="field-group">
                      <span className="field-title">Marca vinculada</span>
                      <select value={brandId} onChange={event => setBrandId(event.target.value)}>
                        <option value="">Sem marca por enquanto</option>
                        {snapshot.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-section-head">
                    <span className="section-number">4</span>
                    <h4>Roteiro & Modelo de IA</h4>
                  </div>
                  <label className="field-group">
                    <span className="field-title">Modelo de prompt / estrutura</span>
                    <select value={promptSelectValue} onChange={event => selectPrompt(event.target.value)}>
                      <optgroup label={`Modelos ${kind === 'image' ? 'PostNow' : 'VideoGo'}`}>
                        {recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{promptLibrary.favorites.includes(recipe.id) ? '★ ' : ''}{recipe.title} · {recipe.category}</option>)}
                      </optgroup>
                      {personalPrompts.length > 0 && <optgroup label="Meus modelos">{personalPrompts.map(prompt => <option key={prompt.id} value={prompt.id}>{promptLibrary.favorites.includes(prompt.id) ? '★ ' : ''}{prompt.title}</option>)}</optgroup>}
                      <option value="custom">Escrever meu próprio prompt</option>
                    </select>
                  </label>
                  <label className="field-group">
                    <span className="field-title">Prompt preparado para o assistente</span>
                    <textarea rows={5} value={promptText} onChange={event => { setPromptChoice('custom'); setPromptText(event.target.value); }} required maxLength={20000} placeholder="O pedido completo aparece aqui para você revisar antes de iniciar o agente." />
                  </label>
                  <details className="briefing-extra-details">
                    <summary>Detalhes adicionais do briefing (opcional)</summary>
                    <textarea rows={3} value={additionalNotes} onChange={event => setAdditionalNotes(event.target.value)} maxLength={10000} placeholder="Referências, limites, exemplos ou informações importantes." />
                  </details>
                  <p className="field-help" style={{ margin: '4px 0 0' }}>Criar o projeto não inicia o agente automaticamente. Você poderá revisar tudo no Studio antes de executar.</p>
                </div>

                <div className="modal-actions">
                  <button className="button secondary" type="button" onClick={resetCreate}>Cancelar</button>
                  <button className="button primary" type="submit">
                    {busy.has('create') ? 'Criando projeto…' : `Criar projeto no ${kind === 'image' ? 'PostNow' : 'VideoGo'}`}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
