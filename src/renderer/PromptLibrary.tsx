import { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, Heart, Search, Sparkles, Trash2 } from 'lucide-react';
import { Modal } from './components';
import type { ProjectFormatId } from '../shared/contracts';
import {
  composePrompt,
  loadPromptLibrary,
  PROMPT_RECIPES,
  savePromptLibrary,
  type PersonalPrompt,
  type PromptKind,
  type PromptRecipe,
  type PromptLibraryData,
} from './prompt-library';

interface PromptLibraryProps {
  kind: PromptKind;
  projectTitle: string;
  currentPrompt: string;
  format: ProjectFormatId;
  onUse: (prompt: string) => void;
  onClose: () => void;
}

type PromptCard = { id: string; title: string; category: string; description: string; prompt: string; personal: boolean };
type LibraryView = 'all' | 'favorites' | 'personal';

function asCard(recipe: PromptRecipe): PromptCard {
  return { id: recipe.id, title: recipe.title, category: recipe.category, description: recipe.description, prompt: recipe.prompt, personal: false };
}
function asPersonalCard(item: PersonalPrompt): PromptCard {
  return { id: item.id, title: item.title, category: 'Meu prompt', description: 'Salvo nesta biblioteca pessoal.', prompt: item.prompt, personal: true };
}

export function PromptLibrary({ kind, format, projectTitle, currentPrompt, onUse, onClose }: PromptLibraryProps) {
  const [library, setLibrary] = useState<PromptLibraryData>(() => loadPromptLibrary(window.localStorage));
  const [view, setView] = useState<LibraryView>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [topic, setTopic] = useState(projectTitle);
  const [audience, setAudience] = useState('Público geral');
  const [tone, setTone] = useState('claro e curioso');
  const [callToAction, setCallToAction] = useState('salve e compartilhe');
  const [promptDraft, setPromptDraft] = useState('');
  const [saveTitle, setSaveTitle] = useState('');
  const [saveFormOpen, setSaveFormOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const cards = useMemo(() => {
    const builtIns = PROMPT_RECIPES.filter(recipe => recipe.kind === kind).map(asCard);
    const custom = library.personal.filter(item => item.kind === kind).map(asPersonalCard);
    const visible = view === 'favorites'
      ? [...builtIns.filter(item => library.favorites.includes(item.id)), ...custom.filter(item => library.favorites.includes(item.id))]
      : view === 'personal' ? custom : [...builtIns, ...custom];
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return visible.filter(item => !query || `${item.title} ${item.category} ${item.description}`.toLocaleLowerCase('pt-BR').includes(query));
  }, [kind, library.favorites, library.personal, search, view]);

  useEffect(() => {
    if (!cards.some(card => card.id === selectedId)) setSelectedId(cards[0]?.id ?? '');
  }, [cards, selectedId]);

  const selected = cards.find(card => card.id === selectedId);
  useEffect(() => {
    if (!selected) { setPromptDraft(''); return; }
    const recipe = PROMPT_RECIPES.find(item => item.id === selected.id);
    setPromptDraft(recipe ? composePrompt(recipe, { topic, audience, tone, callToAction, format }) : selected.prompt);
  }, [selected, topic, audience, tone, callToAction, format]);

  function updateLibrary(next: PromptLibraryData): boolean {
    if (!savePromptLibrary(next, window.localStorage)) {
      setNotice('Não foi possível salvar a biblioteca neste perfil do aplicativo.');
      return false;
    }
    setLibrary(next);
    setNotice('Biblioteca atualizada.');
    return true;
  }

  function toggleFavorite(id: string) {
    const favorites = library.favorites.includes(id) ? library.favorites.filter(item => item !== id) : [...library.favorites, id];
    updateLibrary({ ...library, favorites });
  }

  function saveCurrentPrompt() {
    const title = saveTitle.trim();
    const prompt = currentPrompt.trim();
    if (!title || !prompt) return;
    const item: PersonalPrompt = { id: `personal-${crypto.randomUUID()}`, title, kind, prompt, createdAt: new Date().toISOString() };
    if (updateLibrary({ ...library, personal: [item, ...library.personal].slice(0, 200) })) {
      setView('personal');
      setSelectedId(item.id);
      setSaveTitle('');
      setSaveFormOpen(false);
    }
  }

  function deletePersonalPrompt(id: string) {
    updateLibrary({
      favorites: library.favorites.filter(item => item !== id),
      personal: library.personal.filter(item => item.id !== id),
    });
  }

  return <Modal title="Biblioteca de prompts" wide className="prompt-library-modal" onClose={onClose}>
    <div className="prompt-library-intro">
      <p>Escolha uma receita, ajuste tema e público e revise o texto exato que será enviado ao agente. PostNow e VideoGo continuam responsáveis pela produção.</p>
      <button type="button" className="button small secondary" disabled={!currentPrompt.trim()} onClick={() => { setSaveTitle(''); setSaveFormOpen(value => !value); }}><BookmarkPlus size={14} />Salvar prompt atual</button>
    </div>
    {saveFormOpen && <form className="prompt-save-form" onSubmit={event => { event.preventDefault(); saveCurrentPrompt(); }}>
      <label>Nome para este prompt<input autoFocus maxLength={80} value={saveTitle} onChange={event => setSaveTitle(event.target.value)} placeholder="Ex.: Carrossel de curiosidades sobre ciência" required /></label>
      <div className="card-actions"><button type="button" className="button small ghost" onClick={() => setSaveFormOpen(false)}>Cancelar</button><button type="submit" className="button small primary" disabled={!saveTitle.trim() || !currentPrompt.trim()}>Salvar na minha biblioteca</button></div>
    </form>}
    <div className="prompt-library-tabs" role="group" aria-label="Seções da biblioteca">
      {([['all', 'Modelos prontos'], ['favorites', `Favoritos (${library.favorites.length})`], ['personal', `Meus prompts (${library.personal.filter(item => item.kind === kind).length})`]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} className={`studio-chip ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>{label}</button>)}
      <label className="search-field"><Search size={15} /><span className="sr-only">Buscar prompts</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por tema ou formato…" /></label>
    </div>
    <div className="prompt-library-layout">
      <div className="prompt-library-list" aria-label="Prompts disponíveis">
        {cards.length ? cards.map(card => <article className={`prompt-library-card ${selectedId === card.id ? 'selected' : ''}`} key={card.id}>
          <button type="button" className="prompt-library-card-main" onClick={() => setSelectedId(card.id)} aria-pressed={selectedId === card.id}>
            <span className="prompt-library-category">{card.category}</span><strong>{card.title}</strong><small>{card.description}</small>
          </button>
          <button type="button" className={`icon-button prompt-favorite ${library.favorites.includes(card.id) ? 'active' : ''}`} aria-label={`${library.favorites.includes(card.id) ? 'Remover dos' : 'Adicionar aos'} favoritos: ${card.title}`} aria-pressed={library.favorites.includes(card.id)} onClick={() => toggleFavorite(card.id)}><Heart size={15} fill={library.favorites.includes(card.id) ? 'currentColor' : 'none'} /></button>
          {card.personal && <button type="button" className="icon-button prompt-remove" aria-label={`Excluir ${card.title}`} onClick={() => deletePersonalPrompt(card.id)}><Trash2 size={15} /></button>}
        </article>) : <div className="prompt-library-empty"><strong>Nenhum prompt nesta seção ainda</strong><p>{view === 'favorites' ? 'Favorite um modelo para encontrá-lo aqui.' : 'Salve um prompt seu para reutilizá-lo nos próximos projetos.'}</p></div>}
      </div>
      <section className="prompt-library-editor" aria-label="Editar e revisar prompt">
        {selected ? <>
          <div className="section-heading"><div><span className="prompt-library-category">{selected.category}</span><h3>{selected.title}</h3><p className="field-help">{selected.description}</p></div></div>
          {!selected.personal && <div className="prompt-library-fields">
            <label>Tema<input value={topic} onChange={event => setTopic(event.target.value)} maxLength={1000} placeholder="Ex.: Por que o céu muda de cor?" /></label>
            <div className="form-row"><label>Público<input value={audience} onChange={event => setAudience(event.target.value)} maxLength={300} /></label><label>Tom<input value={tone} onChange={event => setTone(event.target.value)} maxLength={120} /></label></div>
            <label>Chamada final<input value={callToAction} onChange={event => setCallToAction(event.target.value)} maxLength={300} /></label>
          </div>}
          <label className="prompt-preview-label">Prompt que será enviado<textarea rows={12} value={promptDraft} onChange={event => setPromptDraft(event.target.value)} maxLength={20000} /></label>
          {notice && <p className="field-help" role="status">{notice}</p>}
          <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Voltar</button><button type="button" className="button primary" disabled={!promptDraft.trim()} onClick={() => onUse(promptDraft)}><Sparkles size={15} />Usar este prompt</button></div>
        </> : <div className="prompt-library-empty"><strong>Escolha um modelo</strong><p>O prompt completo aparece aqui para você revisar antes de iniciar o agente.</p></div>}
      </section>
    </div>
  </Modal>;
}
