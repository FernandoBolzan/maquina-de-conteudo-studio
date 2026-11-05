import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, ArrowUpRight, Check, FolderOpen, LoaderCircle, X } from 'lucide-react';

export function Empty({ icon = <FolderOpen />, title, children, action }: { icon?: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function Loading({ label = 'Carregando seu estúdio…' }: { label?: string }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={20} />{label}</div>;
}
export function ErrorNotice({ message, onClose }: { message: string; onClose?: () => void }) {
  return <div className="notice error" role="alert"><AlertCircle size={18} /><span>{message}</span>{onClose && <button className="icon-button" aria-label="Fechar erro" onClick={onClose}><X size={16} /></button>}</div>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} onCancel={event => { event.preventDefault(); closeRef.current(); }} aria-labelledby="dialog-title"><div className="modal-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar diálogo"><X size={20} /></button></div>{children}</dialog>;
}
export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</header>;
}
export function SavedNotice({ children }: { children: ReactNode }) { return <span className="saved-note"><Check size={14} />{children}</span>; }
export function ExternalLabel({ children }: { children: ReactNode }) { return <>{children}<ArrowUpRight size={14} /></>; }
