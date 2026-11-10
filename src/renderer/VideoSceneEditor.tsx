import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { VISUAL_TEXT_LIMITS, onScreenError, onScreenItems, type VisualTextEditScene } from '../shared/visual-text';

export interface StoryboardSceneText { id: string; title: string; onScreen: string; }

export interface VideoSceneEditorProps {
  scenes: StoryboardSceneText[];
  disabled?: boolean;
  disabledReason?: string;
  onSave: (scenes: VisualTextEditScene[]) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

export function VideoSceneEditor({ scenes, disabled = false, disabledReason, onSave, onDirtyChange }: VideoSceneEditorProps) {
  const sourceKey = JSON.stringify(scenes);
  const [baseline, setBaseline] = useState<StoryboardSceneText[]>(() => scenes);
  const [drafts, setDrafts] = useState<StoryboardSceneText[]>(() => scenes);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  useEffect(() => {
    const next = JSON.parse(sourceKey) as StoryboardSceneText[];
    setBaseline(next);
    setDrafts(next);
  }, [sourceKey]);

  const itemErrors = drafts.map(draft => onScreenError(draft.onScreen));
  const hasErrors = itemErrors.some(error => error !== undefined);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(baseline);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  const busy = status.kind === 'saving';
  const canSave = !disabled && !busy && dirty && !hasErrors;

  function update(index: number, onScreen: string) {
    setDrafts(current => current.map((draft, position) => position === index ? { ...draft, onScreen } : draft));
    setStatus({ kind: 'idle' });
  }
  function discard() {
    setDrafts(baseline);
    setStatus({ kind: 'idle' });
  }
  async function save() {
    if (!canSave) return;
    setStatus({ kind: 'saving' });
    try {
      await onSave(drafts.map(draft => ({ id: draft.id, onScreen: draft.onScreen })));
      setBaseline(drafts);
      setStatus({ kind: 'saved' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível salvar o storyboard.' });
    }
  }

  return (
    <section className="text-editor" aria-labelledby="scene-text-title">
      <header className="text-editor-head">
        <h3 id="scene-text-title">Texto na tela, cena por cena</h3>
        <p className="text-editor-note">Cada linha vira um item de texto na tela. Alterar esses textos não muda a narração já aprovada.</p>
        {disabled && disabledReason ? <p className="text-editor-note" role="note">{disabledReason}</p> : null}
      </header>
      {drafts.map((draft, index) => {
        const error = itemErrors[index];
        const items = onScreenItems(draft.onScreen).length;
        const fieldId = `scene-${index}-onscreen`;
        return (
          <article className="text-editor-page" key={draft.id} aria-labelledby={`scene-${index}-title`}>
            <h4 id={`scene-${index}-title`}>{draft.title}</h4>
            <div className="text-editor-field">
              <label htmlFor={fieldId}>Texto na tela</label>
              <textarea
                id={fieldId}
                className="text-editor-input"
                rows={4}
                value={draft.onScreen}
                disabled={disabled || busy}
                aria-invalid={error !== undefined}
                aria-describedby={`${fieldId}-meta${error ? ` ${fieldId}-error` : ''}`}
                onChange={event => update(index, event.target.value)}
              />
              <div className="text-editor-meta" id={`${fieldId}-meta`}>
                <span>{items} {items === 1 ? 'item' : 'itens'} · um por linha</span>
                <span>{draft.onScreen.length}/{VISUAL_TEXT_LIMITS.onScreen}</span>
              </div>
              {error ? <p className="text-editor-error" id={`${fieldId}-error`}>{error}</p> : null}
            </div>
          </article>
        );
      })}
      <footer className="text-editor-footer">
        <div className="text-editor-actions">
          <button type="button" className="button primary small" disabled={!canSave} onClick={() => { void save(); }}>
            <Save size={15} aria-hidden="true" /> {busy ? 'Salvando…' : 'Salvar storyboard'}
          </button>
          <button type="button" className="button secondary small" disabled={!dirty || busy} onClick={discard}>Descartar alterações</button>
        </div>
        <p className="text-editor-status" role="status" aria-live="polite">
          {status.kind === 'saving' ? 'Salvando storyboard…' : null}
          {status.kind === 'saved' ? 'Storyboard salvo.' : null}
          {status.kind === 'error' ? <span className="text-editor-error">{status.message}</span> : null}
          {dirty ? 'Salve ou descarte as alterações antes de avançar.' : null}
        </p>
      </footer>
    </section>
  );
}
