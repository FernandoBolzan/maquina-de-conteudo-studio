import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Check, ChevronRight, FolderOpen, LoaderCircle, X } from 'lucide-react';
import type { ChoiceRequest } from './state';

export function Empty({ icon = <FolderOpen />, title, children, action, headingLevel = 2 }: { icon?: ReactNode; title: string; children: ReactNode; action?: ReactNode; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return <div className="empty-state"><div className="empty-icon">{icon}</div><Heading className="empty-state-title">{title}</Heading><p>{children}</p>{action}</div>;
}
export function Loading({ label = 'Carregando seu estúdio…' }: { label?: string }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={20} />{label}</div>;
}
export function ErrorNotice({ message, onClose }: { message: string; onClose?: () => void }) {
  return <div className="notice error" role="alert"><AlertCircle size={18} /><span>{message}</span>{onClose && <button className="icon-button" aria-label="Fechar erro" onClick={onClose}><X size={16} /></button>}</div>;
}
export function Modal({ title, children, onClose, wide = false, className = '' }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} className={`modal${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`} onCancel={event => { event.preventDefault(); closeRef.current(); }} aria-labelledby="dialog-title"><div className="modal-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar diálogo"><X size={20} /></button></div>{children}</dialog>;
}

export function ChoiceDialog({ request, onResolve }: { request: ChoiceRequest; onResolve: (value: string | undefined) => void }) {
  const [selected, setSelected] = useState(request.initial);
  return <Modal title={request.title} onClose={() => onResolve(undefined)}>
    <p className="consent-description">{request.description}</p>
    <form onSubmit={event => { event.preventDefault(); onResolve(selected); }}>
      <fieldset className="choice-group">
        <legend>{request.groupLabel}</legend>
        {request.options.map(option => <label key={option.value} className="choice-option">
          <input type="radio" name="choice" value={option.value} checked={selected === option.value} onChange={() => setSelected(option.value)} />
          <span><strong>{option.label}</strong><small>{option.description}</small></span>
        </label>)}
      </fieldset>
      <div className="consent-note">A ação só começa depois da sua confirmação.</div>
      <div className="modal-actions">
        <button className="button secondary" type="button" onClick={() => onResolve(undefined)}>Cancelar</button>
        <button className="button primary" type="submit">{request.action}<ChevronRight size={16} /></button>
      </div>
    </form>
  </Modal>;
}

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</header>;
}
export function SavedNotice({ children }: { children: ReactNode }) { return <span className="saved-note"><Check size={14} />{children}</span>; }
export function ExternalLabel({ children }: { children: ReactNode }) { return <>{children}<ArrowUpRight size={14} /></>; }
