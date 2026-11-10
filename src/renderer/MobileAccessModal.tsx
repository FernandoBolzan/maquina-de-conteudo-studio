import { useEffect, useState } from 'react';
import qrcode from 'qrcode';
import { Check, CircleStop, Copy, ExternalLink, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import type { MobileTunnelStatus, Snapshot } from '../shared/contracts';
import { Modal } from './components';
import { invoke, type Run } from './state';

interface MobileAccessModalProps {
  snapshot: Snapshot | null;
  refresh: () => Promise<void>;
  run: Run;
  busy: Set<string>;
  onClose: () => void;
}

export function MobileAccessModal({ snapshot, refresh, run, busy, onClose }: MobileAccessModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const mobile = snapshot?.mobile;
  const active = Boolean(mobile?.active && mobile?.url);

  useEffect(() => {
    if (active && mobile?.url) {
      qrcode.toDataURL(mobile.url, {
        margin: 1,
        width: 220,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then(url => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [active, mobile?.url]);

  async function startTunnel() {
    await run('mobile-toggle', async () => {
      await invoke<MobileTunnelStatus>('mobile.start');
      await refresh();
    }, 'Túnel mobile iniciado.');
  }

  async function stopTunnel() {
    await run('mobile-toggle', async () => {
      await invoke<MobileTunnelStatus>('mobile.stop');
      await refresh();
    }, 'Túnel mobile encerrado.');
  }

  async function regeneratePin() {
    await run('mobile-regen', async () => {
      await invoke<{ token: string }>('mobile.regeneratePin');
      await refresh();
    }, 'Novo token gerado.');
  }

  async function copyText(text: string, type: 'url' | 'pin') {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedPin(true);
        setTimeout(() => setCopiedPin(false), 2000);
      }
    } catch {
      /* Ignora falha de clipboard */
    }
  }

  return (
    <Modal title="Acesso Mobile Remoto" onClose={onClose} className="mobile-modal">
      <div className="mobile-modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
          Conecte seu celular para acompanhar o estúdio em tempo real de qualquer lugar. Veja tarefas em andamento, saída do terminal e acesse todos os arquivos de imagem, vídeo e áudio gerados.
        </p>

        {!active ? (
          <div style={{ textAlign: 'center', padding: '24px 12px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-muted, rgba(249,115,22,0.15))', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Smartphone size={24} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Túnel Mobile Desconectado</h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '360px', margin: '0 auto 16px' }}>
              Ao iniciar, um túnel seguro via Cloudflare será estabelecido e um QR Code com token de 6 dígitos será exibido para pareamento.
            </p>
            {mobile?.error && (
              <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
                {mobile.error}
              </div>
            )}
            <button
              type="button"
              className="button primary"
              disabled={busy.has('mobile-toggle')}
              onClick={() => { void startTunnel(); }}
              style={{ margin: '0 auto' }}
            >
              <Smartphone size={16} />
              <span>{busy.has('mobile-toggle') ? 'Iniciando túnel...' : 'Iniciar Acesso Mobile'}</span>
            </button>
          </div>
        ) : (
          <>
            {/* QR Code Container */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', background: '#ffffff', borderRadius: '16px', maxWidth: '240px', margin: '0 auto', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  width="200"
                  height="200"
                  alt="QR Code de Acesso"
                  style={{ display: 'block', width: '200px', height: '200px', borderRadius: '8px' }}
                />
              ) : (
                <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                  <QrCode size={48} />
                </div>
              )}
              <span style={{ color: '#09090b', fontSize: '12px', fontWeight: '700', marginTop: '8px' }}>
                Escaneie com a câmera do celular
              </span>
            </div>

            {/* PIN Token Box */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontWeight: '600' }}>
                Token Alfanumérico de 6 Dígitos
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '10px 0' }}>
                {(mobile?.token || '------').split('').map((char, i) => (
                  <span
                    key={i}
                    style={{
                      width: '38px',
                      height: '46px',
                      background: 'var(--card)',
                      border: '2px solid var(--accent)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      fontWeight: '800',
                      fontFamily: 'monospace',
                      color: 'var(--accent)',
                    }}
                  >
                    {char}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="button small secondary"
                  onClick={() => { void copyText(mobile?.token || '', 'pin'); }}
                >
                  {copiedPin ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
                  <span>{copiedPin ? 'PIN Copiado!' : 'Copiar Token'}</span>
                </button>
                <button
                  type="button"
                  className="button small"
                  disabled={busy.has('mobile-regen')}
                  onClick={() => { void regeneratePin(); }}
                >
                  <RefreshCw size={13} className={busy.has('mobile-regen') ? 'spin' : ''} />
                  <span>Novo Token</span>
                </button>
              </div>
            </div>

            {/* URL Link */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>URL do Túnel Cloudflare:</div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mobile?.url}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="icon-button"
                  title="Copiar link"
                  onClick={() => { void copyText(mobile?.url || '', 'url'); }}
                >
                  {copiedUrl ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="Abrir no navegador"
                  onClick={() => { void invoke('app.external', { url: mobile?.url }); }}
                >
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>

            {/* Status Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)', paddingTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                <span>Túnel ativo · {mobile?.connectedClients ?? 0} celular(es) pareado(s)</span>
              </div>
              <button
                type="button"
                className="button small secondary"
                disabled={busy.has('mobile-toggle')}
                onClick={() => { void stopTunnel(); }}
                style={{ color: '#ef4444' }}
              >
                <CircleStop size={13} />
                <span>Parar Túnel</span>
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
