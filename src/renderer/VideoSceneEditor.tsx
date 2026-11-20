import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ProjectDetail } from '../shared/contracts';
import { VISUAL_TEXT_LIMITS, onScreenError, onScreenItems, type VisualTextEditScene } from '../shared/visual-text';
import type { EditorSaveResult, TextEditorHandle, TextEditorState } from './editor-handle';

export interface StoryboardSceneText { id: string; title: string; onScreen: string; }

export interface VideoSceneEditorProps {
  scenes: StoryboardSceneText[];
  disabled?: boolean;
  disabledReason?: string;
  onSave: (scenes: VisualTextEditScene[]) => Promise<ProjectDetail>;
  onStateChange?: (state: TextEditorState) => void;
}

type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

export const VideoSceneEditor = forwardRef<TextEditorHandle, VideoSceneEditorProps>(function VideoSceneEditor({ scenes, disabled = false, disabledReason, onSave, onStateChange }, ref) {
  const sourceKey = JSON.stringify(scenes);
  const [baseline, setBaseline] = useState<StoryboardSceneText[]>(() => scenes);
  const [drafts, setDrafts] = useState<StoryboardSceneText[]>(() => scenes);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  useEffect(() => {
    const next = JSON.parse(sourceKey) as StoryboardSceneText[];
    // Não descarta rascunho sujo quando o roteiro muda no servidor.
    if (JSON.stringify(drafts) !== JSON.stringify(baseline)) {
      setStatus({ kind: 'error', message: 'O roteiro mudou enquanto você editava. Suas alterações foram preservadas; descarte para carregar a versão atual.' });
      return;
    }
    setBaseline(next);
    setDrafts(next);
  }, [sourceKey]);

  const itemErrors = drafts.map(draft => onScreenError(draft.onScreen));
  const hasErrors = itemErrors.some(error => error !== undefined);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(baseline);
  const busy = status.kind === 'saving';
  const stateListener = useRef(onStateChange);
  useEffect(() => { stateListener.current = onStateChange; }, [onStateChange]);
  useEffect(() => { stateListener.current?.({ dirty, invalid: hasErrors, saving: busy }); }, [dirty, hasErrors, busy]);
  useEffect(() => () => stateListener.current?.({ dirty: false, invalid: false, saving: false }), []);
  const live = useRef({ drafts, hasErrors, onSave });
  live.current = { drafts, hasErrors, onSave };

  function update(index: number, onScreen: string) {
    setDrafts(current => current.map((draft, position) => position === index ? { ...draft, onScreen } : draft));
    setStatus({ kind: 'idle' });
  }
  function discard() {
    const latest = JSON.parse(sourceKey) as StoryboardSceneText[];
    setBaseline(latest);
    setDrafts(latest);
    setStatus({ kind: 'idle' });
  }
  async function save(): Promise<EditorSaveResult> {
    const current = live.current;
    if (current.hasErrors) {
      setStatus({ kind: 'error', message: 'Corrija os campos marcados para continuar.' });
      return { ok: false, reason: 'invalid' };
    }
    setStatus({ kind: 'saving' });
    try {
      const detail = await current.onSave(current.drafts.map(draft => ({ id: draft.id, onScreen: draft.onScreen })));
      setBaseline(current.drafts);
      setStatus({ kind: 'saved' });
      return { ok: true, detail };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível salvar o storyboard.';
      setStatus({ kind: 'error', message });
      return { ok: false, reason: 'error', message };
    }
  }
  useImperativeHandle(ref, () => ({ save }));

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
          <button type="button" className="button secondary small" disabled={!dirty || busy} onClick={discard}>Descartar alterações</button>
        </div>
        <p className="text-editor-status" role="status" aria-live="polite">
          {status.kind === 'saving' ? 'Salvando storyboard…' : null}
          {status.kind === 'saved' ? 'Storyboard salvo.' : null}
          {status.kind === 'error' ? <span className="text-editor-error">{status.message}</span> : null}
          {dirty ? 'Há alterações não salvas. O botão de avançar salva e aprova.' : null}
        </p>
      </footer>
    </section>
  );
});
