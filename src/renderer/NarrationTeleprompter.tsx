import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Mic, RotateCcw, Save, Square, X } from 'lucide-react';
import { NARRATION_RECORDING_MAX_BYTES, type NarrationScene, type NarrationState } from '../shared/contracts';
import { ErrorNotice } from './components';
import { errorMessage, invoke } from './state';

interface Take { blob: Blob; mimeType: string; url: string }
type Phase = 'idle' | 'starting' | 'recording' | 'saving';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export function NarrationTeleprompter({ projectId, scenes, initialIndex = 0, onSaved, onClose }: {
  projectId: string;
  scenes: NarrationScene[];
  initialIndex?: number;
  onSaved: (state: NarrationState) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [phase, setPhase] = useState<Phase>('idle');
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mountedRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const urlsRef = useRef(new Set<string>());

  const current = Math.min(index, scenes.length - 1);
  const scene = scenes[current];
  const take = scene ? takes[scene.id] : undefined;
  const busy = phase === 'starting' || phase === 'recording' || phase === 'saving';

  // Release the microphone and every object URL whenever the overlay goes away.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      detachRecorder(recorderRef.current);
      recorderRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  if (!scene) return null;

  function discardTake(sceneId: string) {
    const existing = takes[sceneId];
    if (!existing) return;
    URL.revokeObjectURL(existing.url);
    urlsRef.current.delete(existing.url);
    setTakes(currentTakes => {
      const next = { ...currentTakes };
      delete next[sceneId];
      return next;
    });
  }

  function go(delta: number) {
    if (busy) return;
    setIndex(Math.min(Math.max(current + delta, 0), scenes.length - 1));
    setError(''); setNotice('');
  }

  async function startRecording() {
    if (busy || !scene) return;
    const sceneId = scene.id;
    const sceneNumber = current + 1;
    setError(''); setNotice('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este ambiente não oferece gravação de áudio pelo microfone.');
      return;
    }
    setPhase('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      setPhase('idle');
      setError(microphoneError(cause));
      return;
    }
    if (!mountedRef.current) { stopStream(stream); return; }
    const mimeType = MIME_CANDIDATES.find(candidate => MediaRecorder.isTypeSupported(candidate)) ?? '';
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (cause) {
      stopStream(stream);
      setPhase('idle');
      setError(`Não foi possível iniciar a gravação: ${errorMessage(cause)}`);
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
    recorder.onerror = () => {
      detachRecorder(recorder);
      stopStream(stream);
      streamRef.current = null; recorderRef.current = null;
      if (mountedRef.current) { setPhase('idle'); setError('A gravação foi interrompida. Tente gravar a cena de novo.'); }
    };
    recorder.onstop = () => {
      stopStream(stream);
      streamRef.current = null; recorderRef.current = null;
      if (!mountedRef.current) return;
      const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0] || 'audio/webm';
      const blob = new Blob(chunks, { type });
      setPhase('idle');
      if (blob.size === 0) { setError('A gravação ficou vazia. Verifique o microfone e grave a cena de novo.'); return; }
      if (blob.size > NARRATION_RECORDING_MAX_BYTES) { setError(`A gravação passa do limite de ${Math.round(NARRATION_RECORDING_MAX_BYTES / 1048576)} MB. Grave um trecho menor.`); return; }
      const url = URL.createObjectURL(blob);
      urlsRef.current.add(url);
      setTakes(currentTakes => ({ ...currentTakes, [sceneId]: { blob, mimeType: type, url } }));
      setNotice(`Cena ${sceneNumber} gravada. Ouça antes de salvar.`);
    };
    discardTake(sceneId);
    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    recorder.start(250);
    setPhase('recording');
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  async function saveScene() {
    if (!take || busy) return;
    const sceneId = scene.id;
    setPhase('saving'); setError(''); setNotice('');
    try {
      const dataBase64 = await blobToBase64(take.blob);
      const state = await invoke<NarrationState>('projects.attachNarrationAudio', {
        projectId,
        sceneId,
        source: { kind: 'recording', mimeType: take.mimeType, dataBase64 },
      });
      onSaved(state);
      if (!mountedRef.current) return;
      discardTake(sceneId);
      setPhase('idle');
      const next = state.scenes.findIndex((item, index) => index > current && Boolean(item.narration.trim()) && !item.audioAttached);
      const remaining = next >= 0 ? next : state.scenes.findIndex((item, index) => index < current && Boolean(item.narration.trim()) && !item.audioAttached);
      if (remaining >= 0) {
        setIndex(remaining);
        setNotice(`Cena ${current + 1} salva. Continue na próxima cena pendente; cenas sem texto são ignoradas.`);
      } else {
        setNotice('Todas as cenas com texto têm áudio salvo. Revise e aprove os arquivos antes do render; você pode voltar para regravar.');
      }
    } catch (cause) {
      if (!mountedRef.current) return;
      setPhase('idle');
      setError(errorMessage(cause));
    }
  }

  const status = scene.audioAttached ? 'gravada' : scene.stray ? 'referência órfã' : 'pendente';

  return (
    <div className="teleprompter-overlay" role="dialog" aria-modal="true" aria-labelledby="teleprompter-title">
      <header className="teleprompter-header">
        <div>
          <h2 id="teleprompter-title">Modo Studio</h2>
          <span className="teleprompter-progress">Cena {current + 1} de {scenes.length} · {status}</span>
        </div>
        <button type="button" className="button small secondary" onClick={onClose} disabled={busy}><X size={14} />Fechar</button>
      </header>
      <main className="teleprompter-stage">
        <p className="teleprompter-scene-title">{scene.title}</p>
        <p className="teleprompter-text" aria-live="polite">{scene.narration.trim() || 'Esta cena não tem texto de narração.'}</p>
      </main>
      {error && <ErrorNotice message={error} onClose={() => setError('')} />}
      {notice && <p className="teleprompter-notice" role="status">{notice}</p>}
      <footer className="teleprompter-controls">
        <button type="button" className="button small secondary" onClick={() => go(-1)} disabled={busy || current === 0}><ChevronLeft size={14} />Anterior</button>
        <div className="teleprompter-recording">
          {phase === 'recording' && (
            <>
              <span className="teleprompter-timer" aria-live="off">● Gravando {formatSeconds(elapsed)}</span>
              <button type="button" className="button small primary" onClick={stopRecording}><Square size={14} />Parar</button>
            </>
          )}
          {(phase === 'starting') && <span className="muted">Abrindo o microfone…</span>}
          {phase === 'saving' && <span className="muted">Salvando a cena…</span>}
          {phase === 'idle' && take && (
            <>
              <audio controls src={take.url} aria-label={`Ouvir gravação da cena ${current + 1}`} />
              <button type="button" className="button small secondary" onClick={() => { void startRecording(); }}><RotateCcw size={14} />Regravar</button>
              <button type="button" className="button small primary" onClick={() => { void saveScene(); }}><Save size={14} />Salvar cena</button>
            </>
          )}
          {phase === 'idle' && !take && scene.narration.trim() && (
            <button type="button" className="button small primary" onClick={() => { void startRecording(); }}><Mic size={14} />Gravar cena</button>
          )}
          {phase === 'idle' && !take && !scene.narration.trim() && <span className="muted">Cena sem texto: passe à próxima cena com narração.</span>}
          {phase === 'idle' && !take && scene.audioAttached && <span className="teleprompter-saved"><Check size={14} />Já salva; regravar substitui o áudio.</span>}
          {phase === 'idle' && !take && scene.stray && <span className="muted">Referência órfã: gravar esta cena substitui o áudio anterior.</span>}
        </div>
        <button type="button" className="button small secondary" onClick={() => go(1)} disabled={busy || current === scenes.length - 1}>Próxima<ChevronRight size={14} /></button>
      </footer>
    </div>
  );
}

function microphoneError(cause: unknown): string {
  const name = cause instanceof DOMException ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permissão de microfone negada. Libere o microfone para a Máquina de Conteúdo nas configurações do sistema e tente de novo.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Nenhum microfone encontrado. Conecte um microfone e tente de novo.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'O microfone está em uso por outro aplicativo ou não pôde ser lido.';
  return `Não foi possível acessar o microfone: ${errorMessage(cause)}`;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach(track => track.stop());
}

// Detach handlers before stopping so a cancelled take never reaches the review state.
function detachRecorder(recorder: MediaRecorder | null) {
  if (!recorder) return;
  recorder.onstop = null;
  recorder.onerror = null;
  recorder.ondataavailable = null;
  if (recorder.state !== 'inactive') recorder.stop();
}

function blobToBase64(blob: Blob): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const reader = new FileReader();
  const failure = new Error('Não foi possível ler a gravação para envio.');
  reader.onerror = () => reject(failure);
  reader.onload = () => {
    const result = reader.result;
    const comma = typeof result === 'string' ? result.indexOf(',') : -1;
    if (typeof result !== 'string' || comma < 0) reject(failure);
    else resolve(result.slice(comma + 1));
  };
  reader.readAsDataURL(blob);
  return promise;
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
