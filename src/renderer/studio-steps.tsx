import { useEffect, useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Download, FolderOpen, Maximize2, RotateCcw, Send, Trash2, X } from 'lucide-react';
import type { AgentAnswer, AgentQuestion } from '../shared/agent-followup';
import { Modal } from './components';

export type StepStatus = 'done' | 'current' | 'upcoming' | 'blocked' | 'running';

export interface StepBarItem {
  id: string;
  title: string;
  status: StepStatus;
  reachable: boolean;
}

const STEP_STATE_LABEL: Record<StepStatus, string> = {
  done: 'Concluído',
  current: 'Próximo passo',
  running: 'Em andamento',
  blocked: 'Configuração necessária',
  upcoming: 'Depois',
};

export function StepBar({ label, steps, activeId, onSelect }: { label: string; steps: StepBarItem[]; activeId: string; onSelect: (id: string) => void }): JSX.Element {
  return (
    <nav aria-label={label}>
      <ol className="studio-stepper">
        {steps.map((step, index) => {
          const isActive = step.id === activeId;
          const className = ['studio-stepper-item', `is-${step.status}`, isActive ? 'is-active' : ''].filter(Boolean).join(' ');
          return (
            <li key={step.id}>
              <button
                type="button"
                className={className}
                aria-current={isActive ? 'step' : undefined}
                disabled={!step.reachable}
                aria-disabled={step.reachable ? undefined : true}
                onClick={() => onSelect(step.id)}
              >
                <span className="studio-stepper-index" aria-hidden="true">
                  {step.status === 'done' ? <Check size={14} /> : index + 1}
                </span>
                <span className="studio-stepper-text">
                  <span className="studio-stepper-title">{step.title}</span>
                  <span className="studio-stepper-state">{STEP_STATE_LABEL[step.status]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepShell({ eyebrow, title, description, children, footer }: { eyebrow: string; title: string; description: ReactNode; children: ReactNode; footer?: ReactNode }): JSX.Element {
  return (
    <section className="studio-step" aria-labelledby="studio-step-title">
      <header className="studio-step-head">
        <span className="studio-step-eyebrow">{eyebrow}</span>
        <h2 id="studio-step-title">{title}</h2>
        <p className="studio-step-description">{description}</p>
      </header>
      <div className="studio-step-body">{children}</div>
      {footer ? <footer className="studio-step-footer">{footer}</footer> : null}
    </section>
  );
}

export function StepNav({ onBack, backLabel = 'Voltar', onNext, nextLabel, nextDisabled, hint, extra }: { onBack?: () => void; backLabel?: string; onNext?: () => void; nextLabel: string; nextDisabled?: boolean; hint?: ReactNode; extra?: ReactNode }): JSX.Element {
  return (
    <>
      {hint ? <p className="studio-step-hint" role="status">{hint}</p> : null}
      <div className="studio-step-nav">
        <div className="studio-step-nav-start">
          {onBack ? (
            <button type="button" className="button ghost" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden="true" />
              {backLabel}
            </button>
          ) : null}
          {extra}
        </div>
        {onNext ? (
          <button type="button" className="button primary" disabled={nextDisabled} onClick={onNext}>
            {nextLabel}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </>
  );
}

export interface ImageReviewItem {
  path: string;
  name: string;
  url: string;
  decision: 'kept' | 'redo' | 'pending';
  note: string;
}

const DECISION_CHIP: Record<ImageReviewItem['decision'], { label: string; className: string }> = {
  kept: { label: 'Mantida', className: 'decision-chip is-kept' },
  redo: { label: 'Refazer', className: 'decision-chip is-redo' },
  pending: { label: 'Pendente', className: 'decision-chip is-pending' },
};

const FOCUSABLE_SELECTOR = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

interface DecisionControlsProps {
  item: ImageReviewItem;
  disabled: boolean;
  onKeep: (path: string) => void;
  onRedo: (path: string, note: string) => void;
  onClear: (path: string) => void;
}

export type ImageDecisionHandlers = Pick<DecisionControlsProps, 'onKeep' | 'onRedo' | 'onClear'>;

function DecisionControls({ item, disabled, onKeep, onRedo, onClear }: DecisionControlsProps): JSX.Element {
  const [redoOpen, setRedoOpen] = useState(false);
  const [note, setNote] = useState(item.note);
  const noteId = useId();
  const hasNote = note.trim().length > 0;

  const openRedo = () => {
    setNote(item.note);
    setRedoOpen(true);
  };
  const confirmRedo = () => {
    onRedo(item.path, note.trim());
    setRedoOpen(false);
  };
  const keep = () => {
    setRedoOpen(false);
    onKeep(item.path);
  };
  const clear = () => {
    setRedoOpen(false);
    onClear(item.path);
  };

  return (
    <div className="image-review-decisions">
      <div className="image-review-decision-buttons">
        <button type="button" className="button small" aria-pressed={item.decision === 'kept'} disabled={disabled} onClick={keep}>
          <Check size={14} aria-hidden="true" />
          Manter
        </button>
        <button type="button" className="button small" aria-pressed={item.decision === 'redo'} disabled={disabled} onClick={openRedo}>
          <RotateCcw size={14} aria-hidden="true" />
          Refazer
        </button>
        <button type="button" className="button small" disabled={disabled} onClick={clear}>
          Limpar decisão
        </button>
      </div>
      {redoOpen ? (
        <div className="image-review-redo">
          <label htmlFor={noteId}>O que deve mudar nesta imagem?</label>
          <textarea
            id={noteId}
            maxLength={1000}
            rows={3}
            value={note}
            disabled={disabled}
            placeholder="Ex.: texto cortado no topo; trocar o fundo por algo mais neutro"
            onChange={(event) => setNote(event.target.value)}
          />
          {hasNote ? null : <p className="field-help">Descreva o ajuste para o próximo Codex.</p>}
          <div className="image-review-redo-actions">
            <button type="button" className="button small primary" disabled={disabled} onClick={confirmRedo}>
              Confirmar refazer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeleteImageButton({ name, disabled, onDelete }: { name: string; disabled: boolean; onDelete: () => void }): JSX.Element {
  return (
    <button type="button" className="button small danger" disabled={disabled} aria-label={`Apagar ${name} do projeto e do disco`} onClick={onDelete}>
      <Trash2 size={14} aria-hidden="true" />
      Apagar do disco
    </button>
  );
}

interface LightboxProps {
  items: ImageReviewItem[];
  index: number;
  disabled: boolean;
  onMove: (index: number) => void;
  onClose: () => void;
  decisions?: ImageDecisionHandlers;
  onDelete?: (path: string) => void;
}

function Lightbox({ items, index, disabled, onMove, onClose, decisions, onDelete }: LightboxProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index];
  const total = items.length;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
        event.preventDefault();
        const step = event.key === 'ArrowLeft' ? -1 : 1;
        onMove((index + step + total) % total);
        return;
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, total, onClose, onMove]);

  if (!item) return null;

  return createPortal(
    <div
      className="lightbox-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.name} ref={dialogRef}>
        <div className="lightbox-toolbar">
          <div className="lightbox-nav">
            <button type="button" className="icon-button" aria-label="Anterior" onClick={() => onMove((index - 1 + total) % total)}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className="lightbox-counter" aria-live="polite">{`${index + 1} / ${total}`}</span>
            <button type="button" className="icon-button" aria-label="Próxima" onClick={() => onMove((index + 1) % total)}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar ampliado" ref={closeRef} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="lightbox-stage">
          <img className="lightbox-image" src={item.url} alt="" />
        </div>
        <div className="lightbox-footer">
          <div className="lightbox-footer-head">
            <span className="lightbox-name" title={item.name}>{item.name}</span>
            <span className={DECISION_CHIP[item.decision].className}>{DECISION_CHIP[item.decision].label}</span>
          </div>
          {decisions ? <DecisionControls key={item.path} item={item} disabled={disabled} {...decisions} /> : null}
          {onDelete ? <DeleteImageButton name={item.name} disabled={disabled} onDelete={() => onDelete(item.path)} /> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ImageReviewGrid({ items, disabled, decisions, onDelete }: { items: ImageReviewItem[]; disabled: boolean; decisions?: ImageDecisionHandlers; onDelete?: (path: string) => void }): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const originRef = useRef<number | null>(null);

  const openAt = (index: number) => {
    originRef.current = index;
    setOpenIndex(index);
  };

  const closeLightbox = () => {
    const origin = originRef.current;
    originRef.current = null;
    setOpenIndex(null);
    if (origin !== null) triggerRefs.current[origin]?.focus();
  };

  if (items.length === 0) return <p className="inline-empty">Nenhuma imagem nesta rodada.</p>;

  const activeIndex = openIndex !== null && openIndex < items.length ? openIndex : null;

  return (
    <>
      <div className="image-review-grid">
        {items.map((item, index) => (
          <article key={item.path} className="image-review-card">
            <button
              type="button"
              className="image-review-thumb"
              aria-label={`Ampliar ${item.name}`}
              ref={(element) => {
                triggerRefs.current[index] = element;
              }}
              onClick={() => openAt(index)}
            >
              <img src={item.url} alt="" />
              <span className="image-review-zoom">
                <Maximize2 size={14} aria-hidden="true" />
                Ampliar
              </span>
            </button>
            <div className="image-review-meta">
              <span className="image-review-name" title={item.name}>{item.name}</span>
              <span className={DECISION_CHIP[item.decision].className}>{DECISION_CHIP[item.decision].label}</span>
            </div>
            {decisions ? <DecisionControls item={item} disabled={disabled} {...decisions} /> : null}
            {onDelete ? <DeleteImageButton name={item.name} disabled={disabled} onDelete={() => onDelete(item.path)} /> : null}
          </article>
        ))}
      </div>
      {activeIndex !== null ? (
        <Lightbox
          items={items}
          index={activeIndex}
          disabled={disabled}
          onMove={setOpenIndex}
          onClose={closeLightbox}
          decisions={decisions}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

export function AgentQuestionsDialog({ questions, lastMessage, busy, onSend, onClose }: { questions: AgentQuestion[]; lastMessage: string; busy: boolean; onSend: (answers: AgentAnswer[]) => void; onClose: () => void }): JSX.Element {
  const [answers, setAnswers] = useState<AgentAnswer[]>(() => questions.map(() => ({ selected: [], text: '' })));
  const complete = answers.length === questions.length && answers.every(answer => answer.selected.length > 0 || answer.text.trim() !== '');

  const update = (index: number, change: Partial<AgentAnswer>) => {
    setAnswers(current => current.map((item, position) => (position === index ? { ...item, ...change } : item)));
  };

  const toggleOption = (index: number, option: string, checked: boolean) => {
    const selected = answers[index]?.selected ?? [];
    update(index, { selected: checked ? [...selected, option] : selected.filter(item => item !== option) });
  };

  return (
    <Modal wide title="O agente tem perguntas" onClose={onClose}>
      <p className="consent-description">Responda cada pergunta. O Studio envia as respostas com o pedido original e a mensagem anterior, em uma nova sessão do agente.</p>
      <form className="agent-questions" onSubmit={(event) => { event.preventDefault(); if (complete && !busy) onSend(answers); }}>
        {questions.map((question, index) => (
          <fieldset key={index} className="agent-question">
            <legend>{`${index + 1}. ${question.text}`}</legend>
            {question.options.map(option => (
              <label key={option} className="choice-option">
                <input type="checkbox" checked={answers[index]?.selected.includes(option) ?? false} disabled={busy} onChange={(event) => toggleOption(index, option, event.target.checked)} />
                <span>{option}</span>
              </label>
            ))}
            <label className="agent-question-text">
              <span>{question.options.length > 0 ? 'Outra resposta' : 'Sua resposta'}</span>
              <textarea rows={2} maxLength={2000} value={answers[index]?.text ?? ''} disabled={busy} onChange={(event) => update(index, { text: event.target.value })} />
            </label>
          </fieldset>
        ))}
        <details className="agent-message-details">
          <summary>Mensagem do agente</summary>
          <pre className="agent-message" tabIndex={0}>{lastMessage}</pre>
        </details>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>Responder depois</button>
          <button className="button primary" type="submit" disabled={busy || !complete}>
            <Send size={16} aria-hidden="true" />
            Enviar respostas
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DeliveryOptions({ approvedCount, totalCount, busy, onSaveZip, onExportFolder, onOpenFolder }: { approvedCount: number; totalCount: number; busy: boolean; onSaveZip: () => void; onExportFolder: () => void; onOpenFolder: () => void }): JSX.Element {
  const nothingApproved = approvedCount === 0;

  return (
    <div className="delivery-options">
      <p className="delivery-summary">{`${approvedCount} de ${totalCount} arquivos aprovados`}</p>
      {nothingApproved ? <p className="inline-warning">Aprove ao menos um arquivo para entregar.</p> : null}
      <div className="delivery-cards">
        <article className="delivery-card">
          <p className="delivery-card-description">Um arquivo .zip com os arquivos aprovados e um MANIFEST.json.</p>
          <button type="button" className="button primary" disabled={busy || nothingApproved} onClick={onSaveZip}>
            <Archive size={16} aria-hidden="true" />
            Salvar ZIP
          </button>
        </article>
        <article className="delivery-card">
          <p className="delivery-card-description">Copia os aprovados para uma pasta escolhida, com MANIFEST.json.</p>
          <button type="button" className="button secondary" disabled={busy || nothingApproved} onClick={onExportFolder}>
            <Download size={16} aria-hidden="true" />
            Exportar pasta
          </button>
        </article>
        <article className="delivery-card">
          <p className="delivery-card-description">Mostra os arquivos do projeto no gerenciador de arquivos.</p>
          <button type="button" className="button ghost" disabled={busy} onClick={onOpenFolder}>
            <FolderOpen size={16} aria-hidden="true" />
            Abrir pasta do projeto
          </button>
        </article>
      </div>
    </div>
  );
}
