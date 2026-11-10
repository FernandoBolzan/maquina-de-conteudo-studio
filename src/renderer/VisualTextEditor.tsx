import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import type { GenerationPageReview } from '../shared/contracts';
import { DEPICTED_PERSON_LABELS, DEPICTED_PERSON_VALUES, type DepictedPerson } from '../shared/depicted-person';
import { VISUAL_TEXT_LIMITS, headlineWordCount, visualTextPageIssues, type VisualTextEditPage, type VisualTextField, type VisualTextPageIssues } from '../shared/visual-text';

interface PageDraft { page: number; headline: string; copy: string; depictedPerson: string; }
type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

export interface VisualTextEditorProps {
  pages: GenerationPageReview[];
  disabled?: boolean;
  disabledReason?: string;
  hasGeneratedImages?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSave: (pages: VisualTextEditPage[]) => Promise<void>;
}

function messages(issues: VisualTextPageIssues, field: VisualTextField) {
  return {
    errors: issues.errors.filter(issue => issue.field === field).map(issue => issue.message),
    warnings: issues.warnings.filter(issue => issue.field === field).map(issue => issue.message),
  };
}

export function VisualTextEditor({ pages, disabled = false, disabledReason, hasGeneratedImages = false, onDirtyChange, onSave }: VisualTextEditorProps) {
  const sourceKey = JSON.stringify(pages);
  const [baseline, setBaseline] = useState<PageDraft[]>(() => pages.map(toPageDraft));
  const [drafts, setDrafts] = useState<PageDraft[]>(() => pages.map(toPageDraft));
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  useEffect(() => {
    const next = (JSON.parse(sourceKey) as GenerationPageReview[]).map(toPageDraft);
    if (JSON.stringify(drafts) !== JSON.stringify(baseline)) {
      setStatus({ kind: 'error', message: 'Os textos do projeto mudaram enquanto você editava. Suas alterações foram preservadas; revise antes de salvar ou descarte para carregar a versão atual.' });
      return;
    }
    setBaseline(next);
    setDrafts(next);
  }, [sourceKey]);

  const issues = drafts.map(draft => visualTextPageIssues(draft));
  const hasErrors = issues.some(item => item.errors.length > 0);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(baseline);
  const changedPages = drafts.filter((draft, index) => JSON.stringify(draft) !== JSON.stringify(baseline[index])).length;
  const busy = status.kind === 'saving';
  useEffect(() => { onDirtyChange?.(dirty || busy); }, [dirty, busy, onDirtyChange]);
  const dirtyListener = useRef(onDirtyChange);
  useEffect(() => { dirtyListener.current = onDirtyChange; }, [onDirtyChange]);
  // Desmontar com rascunho sujo (ex.: páginas somem do servidor) não pode deixar o projeto travado.
  useEffect(() => () => dirtyListener.current?.(false), []);
  const canSave = !disabled && !busy && dirty && !hasErrors;

  function update(index: number, patch: Partial<PageDraft>) {
    setDrafts(current => current.map((draft, position) => position === index ? { ...draft, ...patch } : draft));
    setStatus({ kind: 'idle' });
  }
  function discard() {
    const latest = pages.map(toPageDraft);
    setBaseline(latest);
    setDrafts(latest);
    setStatus({ kind: 'idle' });
  }
  async function save() {
    if (!canSave) return;
    setStatus({ kind: 'saving' });
    try {
      const payload: VisualTextEditPage[] = drafts.map(draft => ({ ...draft, depictedPerson: draft.depictedPerson as DepictedPerson }));
      await onSave(payload);
      setBaseline(drafts);
      setStatus({ kind: 'saved' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível salvar os textos.' });
    }
  }

  return (
    <section className="text-editor" aria-labelledby="visual-text-title">
      <header className="text-editor-head">
        <h3 id="visual-text-title">Textos das páginas</h3>
        <p className="text-editor-note">Revise a headline e a copy de cada página e escolha quem aparece na arte. Salvar remove a aprovação do texto: revise e aprove de novo antes de gerar imagens.</p>
        {hasGeneratedImages ? <p className="text-editor-note">As imagens já geradas não mudam sozinhas. Gere uma nova versão depois de salvar.</p> : null}
        {disabled && disabledReason ? <p className="text-editor-note" role="note">{disabledReason}</p> : null}
      </header>
      {drafts.map((draft, index) => {
        const pageIssues = issues[index];
        const headlineMessages = messages(pageIssues, 'headline');
        const copyMessages = messages(pageIssues, 'copy');
        const personMessages = messages(pageIssues, 'depictedPerson');
        const pageId = `vt-${draft.page}`;
        const headlineWords = headlineWordCount(draft.headline);
        return (
          <article className="text-editor-page" key={draft.page} aria-labelledby={`${pageId}-title`}>
            <h4 id={`${pageId}-title`}>Página {draft.page}</h4>
            <div className="text-editor-field">
              <label htmlFor={`${pageId}-headline`}>Headline</label>
              <input
                id={`${pageId}-headline`}
                className="text-editor-input"
                type="text"
                value={draft.headline}
                disabled={disabled || busy}
                aria-invalid={headlineMessages.errors.length > 0}
                aria-describedby={`${pageId}-headline-meta${headlineMessages.errors.length ? ` ${pageId}-headline-errors` : ''}${headlineMessages.warnings.length ? ` ${pageId}-headline-warnings` : ''}`}
                onChange={event => update(index, { headline: event.target.value })}
              />
              <div className="text-editor-meta" id={`${pageId}-headline-meta`}>
                <span>{headlineWords} {headlineWords === 1 ? 'palavra' : 'palavras'} · recomendado de 2 a 6</span>
                <span>{draft.headline.trim().length}/{VISUAL_TEXT_LIMITS.headline}</span>
              </div>
              {headlineMessages.errors.map(message => <p className="text-editor-error" id={`${pageId}-headline-errors`} key={message}>{message}</p>)}
              {headlineMessages.warnings.map(message => <p className="text-editor-warning" id={`${pageId}-headline-warnings`} key={message}>{message}</p>)}
            </div>
            <div className="text-editor-field">
              <label htmlFor={`${pageId}-copy`}>Copy</label>
              <textarea
                id={`${pageId}-copy`}
                className="text-editor-input"
                rows={5}
                value={draft.copy}
                disabled={disabled || busy}
                aria-invalid={copyMessages.errors.length > 0}
                aria-describedby={`${pageId}-copy-meta${copyMessages.errors.length ? ` ${pageId}-copy-errors` : ''}`}
                onChange={event => update(index, { copy: event.target.value })}
              />
              <div className="text-editor-meta" id={`${pageId}-copy-meta`}>
                <span>Texto que acompanha a arte.</span>
                <span>{draft.copy.trim().length}/{VISUAL_TEXT_LIMITS.copy}</span>
              </div>
              {copyMessages.errors.map(message => <p className="text-editor-error" id={`${pageId}-copy-errors`} key={message}>{message}</p>)}
            </div>
            <div className="text-editor-field">
              <label htmlFor={`${pageId}-person`}>Quem aparece na arte</label>
              <select
                id={`${pageId}-person`}
                className="text-editor-input"
                value={draft.depictedPerson}
                disabled={disabled || busy}
                aria-invalid={personMessages.errors.length > 0}
                aria-describedby={personMessages.errors.length ? `${pageId}-person-errors` : undefined}
                onChange={event => update(index, { depictedPerson: event.target.value })}
              >
                <option value="">Escolha uma opção</option>
                {DEPICTED_PERSON_VALUES.map(value => <option value={value} key={value}>{DEPICTED_PERSON_LABELS[value]}</option>)}
              </select>
              {personMessages.errors.map(message => <p className="text-editor-error" id={`${pageId}-person-errors`} key={message}>{message}</p>)}
            </div>
          </article>
        );
      })}
      <footer className="text-editor-footer">
        <div className="text-editor-actions">
          <button type="button" className="button primary small" disabled={!canSave} onClick={() => { void save(); }}>
            <Save size={15} aria-hidden="true" /> {busy ? 'Salvando…' : 'Salvar textos'}
          </button>
          <button type="button" className="button secondary small" disabled={!dirty || busy} onClick={discard}>Descartar alterações</button>
        </div>
        <p className="text-editor-status" role="status" aria-live="polite">
          {status.kind === 'saving' ? 'Salvando textos…' : null}
          {status.kind === 'saved' ? 'Textos salvos. Aprove o texto de novo antes de gerar imagens.' : null}
          {status.kind === 'error' ? <span className="text-editor-error">{status.message}</span> : null}
          {status.kind === 'idle' && dirty ? `${changedPages} ${changedPages === 1 ? 'página com alterações não salvas' : 'páginas com alterações não salvas'}.` : null}
          {status.kind === 'idle' && hasErrors && dirty ? ' Corrija os campos marcados para salvar.' : null}
        </p>
      </footer>
    </section>
  );
}

function toPageDraft(page: GenerationPageReview): PageDraft {
  return { page: page.page, headline: page.headline, copy: page.copy, depictedPerson: page.depictedPerson };
}
