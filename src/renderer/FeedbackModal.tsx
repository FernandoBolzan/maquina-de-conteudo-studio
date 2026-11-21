import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { Check, ExternalLink, ImagePlus, LoaderCircle, Send, X } from 'lucide-react';
import { FEEDBACK_IMAGE_MIME, FEEDBACK_KINDS, FEEDBACK_LIMITS, FEEDBACK_REPOSITORY, type FeedbackKind, type FeedbackResult } from '../shared/feedback';
import { ErrorNotice, Modal } from './components';
import { errorMessage, invoke } from './state';

interface Attachment { id: number; name: string; data: string; preview: string; }
const ACCEPTED = Object.values(FEEDBACK_IMAGE_MIME);
const LIMIT_MB = FEEDBACK_LIMITS.imageBytes / 1024 / 1024;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name || 'a imagem'}.`));
    reader.readAsDataURL(file);
  });
}

export function FeedbackModal({ onClose, onOpenSetup }: { onClose: () => void; onOpenSetup: () => void }) {
  const [login, setLogin] = useState<string | undefined | null>(null);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FeedbackResult | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    let current = true;
    invoke<string | undefined>('setup.githubLogin').then(value => { if (current) setLogin(value ?? undefined); }).catch(() => { if (current) setLogin(undefined); });
    const urls = previews.current;
    return () => { current = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

  async function addFiles(files: File[]) {
    setError('');
    const room = FEEDBACK_LIMITS.images - attachments.length;
    if (room <= 0) { setError(`Anexe no máximo ${FEEDBACK_LIMITS.images} imagens.`); return; }
    const added: Attachment[] = [];
    try {
      for (const file of files.slice(0, room)) {
        if (!ACCEPTED.includes(file.type)) throw new Error(`${file.name || 'O arquivo'} não é PNG, JPG, GIF ou WebP.`);
        if (file.size > FEEDBACK_LIMITS.imageBytes) throw new Error(`${file.name || 'A imagem'} passa de ${LIMIT_MB} MB.`);
        const preview = URL.createObjectURL(file);
        previews.current.add(preview);
        added.push({ id: nextId.current++, name: file.name || 'imagem colada', data: await readBase64(file), preview });
      }
      if (files.length > room) setError(`Só cabem ${FEEDBACK_LIMITS.images} imagens; as demais foram ignoradas.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
    if (added.length) setAttachments(list => [...list, ...added]);
  }

  function removeAttachment(id: number) {
    setAttachments(list => list.filter(item => {
      if (item.id !== id) return true;
      URL.revokeObjectURL(item.preview);
      previews.current.delete(item.preview);
      return false;
    }));
  }

  function onPaste(event: ClipboardEvent) {
    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    void addFiles(files);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void addFiles([...event.dataTransfer.files]);
  }

  async function send() {
    setSending(true);
    setError('');
    try {
      setResult(await invoke<FeedbackResult>('feedback.send', {
        confirm: true, kind, title, message, includeDiagnostics,
        images: attachments.map(({ data }) => ({ data })),
      }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  const canSend = login !== null && login !== undefined && title.trim() !== '' && message.trim() !== '' && !sending;
  return (
    <Modal title={result ? 'Feedback enviado' : 'Enviar feedback'} onClose={() => { if (!sending) onClose(); }} wide className="feedback-modal">
      {result ? (
        <div className="feedback-done">
          <div className="consent-icon"><Check size={24} /></div>
          <p className="consent-description">O issue <strong>#{result.number}</strong> foi criado em seu nome{result.images ? `, com ${result.images} ${result.images === 1 ? 'imagem' : 'imagens'}` : ''}. Você acompanha as respostas pelo GitHub.</p>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>Fechar</button>
            <button type="button" className="button primary" onClick={() => { void invoke('app.external', { url: result.url }).catch(caught => setError(errorMessage(caught))); }}>
              <ExternalLink size={15} />Abrir no GitHub
            </button>
          </div>
          {error && <ErrorNotice message={error} onClose={() => setError('')} />}
        </div>
      ) : (
        <form className="feedback-form" onPaste={onPaste} onSubmit={event => { event.preventDefault(); if (canSend) void send(); }}>
          <p className="consent-description">Conte o que aconteceu ou o que você gostaria de ver. Vira um issue no GitHub do projeto, criado com a sua conta.</p>
          <label>Tipo
            <select value={kind} disabled={sending} onChange={event => setKind(event.target.value as FeedbackKind)}>
              {Object.entries(FEEDBACK_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Resumo
            <input value={title} maxLength={FEEDBACK_LIMITS.title} disabled={sending} onChange={event => setTitle(event.target.value)} placeholder="Ex.: a capa do carrossel sai sem a logo" />
          </label>
          <label>Detalhes
            <textarea value={message} rows={6} maxLength={FEEDBACK_LIMITS.message} disabled={sending} onChange={event => setMessage(event.target.value)} placeholder="Passo a passo para repetir o problema, o que você esperava e o que aconteceu." />
          </label>

          <div
            className={`feedback-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <button type="button" className="button small secondary" disabled={sending || attachments.length >= FEEDBACK_LIMITS.images} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={14} />Anexar imagem
            </button>
            <span>ou arraste/cole um print aqui · PNG, JPG, GIF ou WebP até {LIMIT_MB} MB · {attachments.length}/{FEEDBACK_LIMITS.images}</span>
            <input ref={fileInput} type="file" hidden multiple accept={ACCEPTED.join(',')} onChange={event => { void addFiles([...(event.target.files ?? [])]); event.target.value = ''; }} />
          </div>
          {attachments.length > 0 && (
            <ul className="feedback-thumbs" aria-label="Imagens anexadas">
              {attachments.map(item => (
                <li key={item.id}>
                  <img src={item.preview} alt={item.name} />
                  <button type="button" className="icon-button" aria-label={`Remover ${item.name}`} disabled={sending} onClick={() => removeAttachment(item.id)}><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}

          <label className="feedback-check">
            <input type="checkbox" checked={includeDiagnostics} disabled={sending} onChange={event => setIncludeDiagnostics(event.target.checked)} />
            <span>Incluir versão do Studio, sistema operacional e agente padrão</span>
          </label>

          {login === null ? (
            <div className="notice" role="status"><LoaderCircle className="spin" size={16} /><span>Verificando sua conta do GitHub…</span></div>
          ) : login ? (
            <div className="consent-note">
              Será publicado em <strong>github.com/{FEEDBACK_REPOSITORY}</strong> como <strong>@{login}</strong>. Issues são públicos: não inclua chaves de API, senhas nem dados de clientes{attachments.length ? '. As imagens ficam em um gist secreto da sua conta (só quem tem o link as vê)' : ''}.
            </div>
          ) : (
            <div className="notice error" role="alert">
              <span>Conecte sua conta do GitHub para enviar feedback.</span>
              <button type="button" className="button small" onClick={onOpenSetup}>Abrir Motores &amp; Setup</button>
            </div>
          )}
          {error && <ErrorNotice message={error} onClose={() => setError('')} />}

          <div className="modal-actions">
            <button type="button" className="button secondary" disabled={sending} onClick={onClose}>Cancelar</button>
            <button type="submit" className="button primary" disabled={!canSend}>
              {sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{sending ? 'Enviando…' : 'Enviar feedback'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
