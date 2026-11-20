import { useEffect, useState } from 'react';
import type { ProjectDetail } from '../shared/contracts';
import { VISUAL_TEXT_LIMITS, captionIssues } from '../shared/visual-text';

export interface CaptionPanelProps {
  caption: string;
  disabled?: boolean;
  /** Texto de apoio abaixo do título; muda conforme o painel aparece depois da geração ou como correção em Textos. */
  help: string;
  onSave: (caption: string) => Promise<ProjectDetail>;
}

/** Legenda única da publicação: uma só para o post ou carrossel inteiro, editável e copiável depois de gerar as imagens. */
export function CaptionPanel({ caption, disabled = false, help, onSave }: CaptionPanelProps) {
  const [draft, setDraft] = useState(caption);
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'copied' } | { kind: 'error'; message: string }>({ kind: 'idle' });
  useEffect(() => { setDraft(caption); }, [caption]);
  const issues = captionIssues(draft);
  const dirty = draft.trim() !== caption.trim();

  async function save() {
    setStatus({ kind: 'saving' });
    try {
      await onSave(draft.trim());
      setStatus({ kind: 'saved' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível salvar a legenda.' });
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.trim());
      setStatus({ kind: 'copied' });
    } catch {
      setStatus({ kind: 'error', message: 'Não foi possível copiar. Selecione o texto e copie manualmente.' });
    }
  }

  return (
    <section className="caption-panel" aria-labelledby="caption-panel-title">
      <h3 id="caption-panel-title">Legenda da publicação</h3>
      <p className="field-help">{help}</p>
      <textarea className="text-editor-input" rows={7} value={draft} disabled={disabled || status.kind === 'saving'} onChange={event => { setDraft(event.target.value); setStatus({ kind: 'idle' }); }} aria-label="Legenda da publicação" aria-invalid={dirty && issues.length > 0} />
      <div className="text-editor-meta">
        <span>Termine com uma linha de 5 hashtags relacionadas.</span>
        <span>{draft.trim().length}/{VISUAL_TEXT_LIMITS.copy}</span>
      </div>
      {issues.map(message => <p className="text-editor-error" key={message}>{message}</p>)}
      <div className="caption-panel-actions">
        <button type="button" className="button secondary small" disabled={disabled || !dirty || issues.length > 0 || status.kind === 'saving'} onClick={() => { void save(); }}>Salvar legenda</button>
        <button type="button" className="button secondary small" disabled={!draft.trim()} onClick={() => { void copy(); }}>Copiar legenda</button>
        <span className="text-editor-status" role="status" aria-live="polite">
          {status.kind === 'saving' ? 'Salvando…' : null}
          {status.kind === 'saved' ? 'Legenda salva.' : null}
          {status.kind === 'copied' ? 'Legenda copiada.' : null}
          {status.kind === 'error' ? status.message : null}
        </span>
      </div>
    </section>
  );
}
