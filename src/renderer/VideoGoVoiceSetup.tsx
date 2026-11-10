import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mic2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  Volume2
} from 'lucide-react';
import type { ElevenLabsVoice } from '../shared/contracts';
import { invoke, errorMessage, type ScreenProps } from './state';
import { ExternalLabel } from './components';

export function VideoGoVoiceSetup({ snapshot, run, refresh, busy, confirm }: ScreenProps & { onGoEngines?: () => void }) {
  const [elevenKey, setElevenKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [elevenError, setElevenError] = useState('');
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voiceName, setVoiceName] = useState('');
  const [speakerAuthorized, setSpeakerAuthorized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'cloned' | 'premade'>('all');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elevenLabs = snapshot.integrations.elevenLabs;

  const loadVoices = useCallback(async () => {
    setElevenError('');
    try {
      setVoices(await invoke<ElevenLabsVoice[]>('elevenlabs.voices'));
    } catch (error) {
      setElevenError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (elevenLabs.configured) void loadVoices();
    else setVoices([]);
  }, [elevenLabs.configured, loadVoices]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const togglePlayPreview = useCallback((voiceId: string, previewUrl?: string) => {
    if (!previewUrl) return;
    if (playingVoiceId === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoiceId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    setPlayingVoiceId(voiceId);
    audio.play().catch(() => {
      setPlayingVoiceId(null);
    });
    audio.onended = () => {
      setPlayingVoiceId(null);
    };
    audio.onerror = () => {
      setPlayingVoiceId(null);
    };
  }, [playingVoiceId]);

  async function saveElevenLabsKey() {
    const key = elevenKey;
    if (!key.trim()) return;
    setElevenError('');
    await run('elevenlabs-save', async () => {
      try {
        await invoke('elevenlabs.configure', { key });
      } catch (error) {
        setElevenError(errorMessage(error));
        throw error;
      }
      setElevenKey('');
      await refresh();
      await loadVoices();
    }, 'API key armazenada no cofre do sistema.');
  }

  async function clearElevenLabsKey() {
    if (!await confirm('Remover a API key ElevenLabs', 'A chave cifrada será apagada do dispositivo. Projetos e áudios já gerados não serão removidos.', 'Remover chave')) return;
    await run('elevenlabs-clear', async () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoiceId(null);
      await invoke('elevenlabs.clear');
      setVoices([]);
      setElevenKey('');
      await refresh();
    }, 'API key removida.');
  }

  async function cloneVoice() {
    if (!speakerAuthorized) {
      setElevenError('Confirme que a voz é sua ou que você tem autorização explícita.');
      return;
    }
    if (!voiceName.trim()) {
      setElevenError('Informe um nome para a voz clonada.');
      return;
    }
    const samplePath = await invoke<string | undefined>('app.pick', { extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg'] });
    if (!samplePath) return;
    if (!await confirm('Enviar amostra para clonagem', 'A amostra será enviada à ElevenLabs para criar um clone instantâneo. Só prossiga se a voz for sua ou se você tiver autorização explícita; a operação pode consumir créditos. A amostra não será guardada pelo Studio.', 'Enviar e criar clone')) return;
    await run('elevenlabs-clone', async () => {
      await invoke('elevenlabs.clone', { name: voiceName.trim(), samplePath, speakerAuthorized: true, confirm: true });
      setVoiceName('');
      setSpeakerAuthorized(false);
      await loadVoices();
    }, 'Voz clonada adicionada à biblioteca da conta.');
  }

  async function deleteClone(voice: ElevenLabsVoice) {
    if (!await confirm(`Excluir o clone “${voice.name}”`, 'A voz será removida permanentemente da conta ElevenLabs. Áudios já gerados no projeto permanecem locais.', 'Excluir clone')) return;
    await run(`elevenlabs-delete-${voice.id}`, async () => {
      if (playingVoiceId === voice.id && audioRef.current) {
        audioRef.current.pause();
        setPlayingVoiceId(null);
      }
      await invoke('elevenlabs.deleteClone', { voiceId: voice.id, confirm: true });
      await loadVoices();
    }, 'Clone removido da ElevenLabs.');
  }

  const filteredVoices = useMemo(() => {
    return voices.filter(voice => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query ||
        voice.name.toLowerCase().includes(query) ||
        Boolean(voice.category && voice.category.toLowerCase().includes(query)) ||
        Boolean(voice.language && voice.language.toLowerCase().includes(query));
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'cloned' && voice.isClone) ||
        (categoryFilter === 'premade' && !voice.isClone);
      return matchesSearch && matchesCategory;
    });
  }, [voices, searchQuery, categoryFilter]);

  const totalClones = useMemo(() => voices.filter(v => v.isClone).length, [voices]);
  const totalPremade = useMemo(() => voices.filter(v => !v.isClone).length, [voices]);

  return (
    <div className="setup-stack elevenlabs-dashboard" aria-label="Painel ElevenLabs e Voz">
      {/* Trust & Security Ribbon */}
      <div className="elevenlabs-trust-ribbon" role="region" aria-label="Garantias de segurança e governança de voz">
        <div className="trust-pillar">
          <div className="trust-pillar-icon"><ShieldCheck size={18} /></div>
          <div className="trust-pillar-text">
            <strong>Cofre Seguro do SO</strong>
            <span>{elevenLabs.secureStorageAvailable ? 'Cifrado com safeStorage' : 'Chaveiro não detectado'}</span>
          </div>
        </div>
        <div className="trust-pillar">
          <div className="trust-pillar-icon"><Lock size={18} /></div>
          <div className="trust-pillar-text">
            <strong>Zero Vazamento</strong>
            <span>Isolada do renderer e logs de execução</span>
          </div>
        </div>
        <div className="trust-pillar">
          <div className="trust-pillar-icon"><Volume2 size={18} /></div>
          <div className="trust-pillar-text">
            <strong>Síntese Hash-Bound</strong>
            <span>Voz gerada após aprovação humana explícita</span>
          </div>
        </div>
        <div className="trust-pillar">
          <div className="trust-pillar-icon"><Mic2 size={18} /></div>
          <div className="trust-pillar-text">
            <strong>Áudio Local Próprio</strong>
            <span>Suporta gravação por cena offline</span>
          </div>
        </div>
      </div>

      {/* Card 1: Conexão e API Key */}
      <article className="setup-card elevenlabs-card" id="videogo-voice-title">
        <div className="setup-card-head">
          <div className="setup-card-title-group">
            <AudioLines size={18} className="card-brand-icon" />
            <div>
              <strong>Conexão ElevenLabs (API Key)</strong>
              <p className="field-help">Chave de acesso oficial para o modelo Eleven v4 no VideoGo.</p>
            </div>
          </div>
          <span className={`status-pill ${elevenLabs.configured ? 'ok' : 'warn'}`}>
            {elevenLabs.configured ? 'Conectado' : 'Não configurado'}
          </span>
        </div>

        {!elevenLabs.secureStorageAvailable && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            <span>O cofre seguro do sistema não estava disponível na última verificação. No Linux, certifique-se de que um chaveiro (Secret Service/KWallet) está ativo. A chave nunca é salva em texto puro.</span>
          </div>
        )}

        {elevenLabs.error && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            <span>{elevenLabs.error}</span>
          </div>
        )}

        {elevenLabs.warning && (
          <div className="notice warn" role="status">
            <CheckCircle2 size={18} />
            <span>Chave salva com ressalva: {elevenLabs.warning}</span>
          </div>
        )}

        <div className="api-key-input-block">
          <label htmlFor="elevenlabs-api-key">
            API key
            <div className="password-input-wrap">
              <input
                id="elevenlabs-api-key"
                type={showKey ? 'text' : 'password'}
                value={elevenKey}
                disabled={busy.has('elevenlabs-save')}
                autoComplete="new-password"
                spellCheck={false}
                onChange={event => { setElevenKey(event.target.value); setElevenError(''); }}
                placeholder={elevenLabs.configured ? '•••••••••••••••••••• (chave configurada no cofre seguro)' : 'Cole sua API key da ElevenLabs aqui'}
              />
              <button
                type="button"
                className="icon-button password-toggle-btn"
                aria-label={showKey ? 'Ocultar chave' : 'Exibir chave'}
                onClick={() => setShowKey(val => !val)}
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          {elevenError && <p className="warning-text" role="status">{elevenError}</p>}
        </div>

        <div className="card-actions">
          <button
            type="button"
            className="button small primary"
            disabled={!elevenKey.trim() || busy.has('elevenlabs-save') || busy.has('elevenlabs-clear')}
            onClick={() => { void saveElevenLabsKey(); }}
          >
            <KeyRound size={14} className={busy.has('elevenlabs-save') ? 'spin' : ''} />
            {busy.has('elevenlabs-save') ? 'Validando e guardando…' : 'Validar e guardar no cofre'}
          </button>
          {elevenLabs.configured && (
            <button
              type="button"
              className="button small secondary"
              disabled={busy.has('elevenlabs-voices')}
              onClick={() => { void run('elevenlabs-voices', loadVoices, 'Biblioteca de vozes atualizada.'); }}
            >
              <RefreshCw size={14} className={busy.has('elevenlabs-voices') ? 'spin' : ''} />
              Atualizar vozes
            </button>
          )}
          {elevenLabs.configured && (
            <button
              type="button"
              className="button small ghost danger-hover"
              disabled={busy.has('elevenlabs-clear') || busy.has('elevenlabs-save')}
              onClick={() => { void clearElevenLabsKey(); }}
            >
              <Trash2 size={14} />
              Remover chave
            </button>
          )}
        </div>

        <details className="elevenlabs-instructions" open={!elevenLabs.configured}>
          <summary>Permissões oficiais necessárias &amp; Orientações de segurança</summary>
          <ol>
            <li>Crie uma API key no dashboard da ElevenLabs habilitando apenas os acessos necessários.</li>
            <li>Para listar vozes: <code>voices_read</code>. Para gerar áudio no VideoGo: <code>text_to_speech</code>.</li>
            <li>Para clonar e gerenciar vozes: <code>voices_write</code> e <code>create_instant_voice_clone</code>.</li>
            <li>Defina um limite mensal de caracteres ou créditos na sua conta ElevenLabs para controle de custos.</li>
          </ol>
          <div className="instruction-links">
            <button type="button" className="button small ghost" onClick={() => { void invoke('app.external', { url: 'https://elevenlabs.io/app/settings/api-keys' }); }}>
              <ExternalLabel>Criar API key</ExternalLabel>
            </button>
            <button type="button" className="button small ghost" onClick={() => { void invoke('app.external', { url: 'https://elevenlabs.io/docs/api-reference/service-accounts/api-keys/create' }); }}>
              <ExternalLabel>Permissões oficiais</ExternalLabel>
            </button>
            <button type="button" className="button small ghost" onClick={() => { void invoke('app.external', { url: 'https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/instant-voice-cloning' }); }}>
              <ExternalLabel>Guia de clonagem</ExternalLabel>
            </button>
          </div>
        </details>
      </article>

      {/* Card 2: Catálogo de Vozes */}
      <article className="setup-card">
        <div className="setup-card-head">
          <div className="setup-card-title-group">
            <Mic2 size={18} className="card-brand-icon" />
            <div>
              <strong>Catálogo de Vozes da Conta ({voices.length})</strong>
              <p className="field-help">Vozes disponíveis para narrar cenas e roteiros no VideoGo.</p>
            </div>
          </div>
          {elevenLabs.configured && (
            <div className="voice-stats-strip">
              <span className="status-pill mini">{totalPremade} catálogo</span>
              {totalClones > 0 && <span className="status-pill ok mini">{totalClones} clones</span>}
            </div>
          )}
        </div>

        {elevenLabs.configured ? (
          <>
            <div className="voice-filter-bar">
              <div className="voice-search-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar voz por nome, categoria ou idioma…"
                  className="voice-search-input"
                />
              </div>
              <div className="voice-filter-pills" role="radiogroup" aria-label="Filtrar vozes">
                <button
                  type="button"
                  className={`voice-filter-pill ${categoryFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('all')}
                >
                  Todas ({voices.length})
                </button>
                <button
                  type="button"
                  className={`voice-filter-pill ${categoryFilter === 'cloned' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('cloned')}
                >
                  Clones ({totalClones})
                </button>
                <button
                  type="button"
                  className={`voice-filter-pill ${categoryFilter === 'premade' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('premade')}
                >
                  Catálogo ({totalPremade})
                </button>
              </div>
            </div>

            {filteredVoices.length > 0 ? (
              <div className="voice-card-grid">
                {filteredVoices.map(voice => (
                  <div className={`voice-item-card ${playingVoiceId === voice.id ? 'is-playing' : ''}`} key={voice.id}>
                    <div className="voice-item-header">
                      <div className="voice-avatar" aria-hidden="true">
                        {playingVoiceId === voice.id ? <Volume2 size={16} className="voice-pulse" /> : <Mic2 size={16} />}
                      </div>
                      <div className="voice-info">
                        <strong className="voice-name" title={voice.name}>{voice.name}</strong>
                        <div className="voice-tags">
                          <span className={`voice-tag ${voice.isClone ? 'clone' : 'standard'}`}>
                            {voice.isClone ? 'Clone próprio' : voice.category || 'Catálogo'}
                          </span>
                          {voice.language && <span className="voice-tag lang">{voice.language}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="voice-card-actions">
                      {voice.previewUrl && (
                        <button
                          type="button"
                          className={`voice-play-btn ${playingVoiceId === voice.id ? 'active' : ''}`}
                          onClick={() => togglePlayPreview(voice.id, voice.previewUrl)}
                          aria-label={playingVoiceId === voice.id ? `Pausar amostra de ${voice.name}` : `Ouvir amostra de ${voice.name}`}
                        >
                          {playingVoiceId === voice.id ? <Square size={12} /> : <Play size={12} />}
                          <span>{playingVoiceId === voice.id ? 'Parar' : 'Amostra'}</span>
                        </button>
                      )}
                      {voice.isClone && (
                        <button
                          type="button"
                          className="button small ghost danger-hover"
                          disabled={busy.has(`elevenlabs-delete-${voice.id}`)}
                          onClick={() => { void deleteClone(voice); }}
                          title="Excluir clone da ElevenLabs"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state voice-empty">
                <p>Nenhuma voz encontrada com o filtro atual.</p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state voice-empty">
            <div className="empty-icon"><AudioLines size={24} /></div>
            <h3>API key necessária para listar vozes</h3>
            <p>Guarde sua chave de API ElevenLabs no cofre acima para sincronizar e ouvir o catálogo de vozes.</p>
          </div>
        )}
      </article>

      {/* Card 3: Clonagem Instantânea */}
      <article className="setup-card">
        <div className="setup-card-head">
          <div className="setup-card-title-group">
            <Sparkles size={18} className="card-brand-icon" />
            <div>
              <strong>Clonagem Instantânea de Voz (Instant Voice Cloning)</strong>
              <p className="field-help">Adicione sua própria voz à biblioteca para narrações autênticas no VideoGo.</p>
            </div>
          </div>
        </div>

        <div className="voice-clone-guidance-grid">
          <div className="guidance-step-card">
            <span className="step-badge">1</span>
            <strong>Duração recomendada</strong>
            <p>Grave de 2 a 5 minutos com fala natural, ritmo estável e boa dicção.</p>
          </div>
          <div className="guidance-step-card">
            <span className="step-badge">2</span>
            <strong>Captação limpa</strong>
            <p>Evite eco, música de fundo, ruído constante ou sobreposição de outras vozes.</p>
          </div>
          <div className="guidance-step-card">
            <span className="step-badge">3</span>
            <strong>Formatos aceitos</strong>
            <p>WAV, MP3, M4A, FLAC ou OGG (até 100 MB). Verificado localmente com FFprobe.</p>
          </div>
        </div>

        <div className="clone-form-block">
          <label htmlFor="clone-voice-name">
            Nome da nova voz clonada
            <input
              id="clone-voice-name"
              value={voiceName}
              maxLength={100}
              onChange={event => setVoiceName(event.target.value)}
              placeholder="Ex.: Minha Voz Principal (PT-BR)"
              disabled={!elevenLabs.configured || busy.has('elevenlabs-clone')}
            />
          </label>

          <label className="consent-check-card">
            <input
              type="checkbox"
              checked={speakerAuthorized}
              onChange={event => setSpeakerAuthorized(event.target.checked)}
              disabled={!elevenLabs.configured || busy.has('elevenlabs-clone')}
            />
            <div>
              <strong>Declaração de Consentimento &amp; Titularidade</strong>
              <p>Confirmo expressamente que esta é minha própria voz ou que possuo autorização legal explícita do titular para gravação, clonagem e geração de fala.</p>
            </div>
          </label>

          <div className="card-actions">
            <button
              type="button"
              className="button small primary"
              disabled={!elevenLabs.configured || !speakerAuthorized || !voiceName.trim() || busy.has('elevenlabs-clone')}
              onClick={() => { void cloneVoice(); }}
            >
              <UploadCloud size={14} className={busy.has('elevenlabs-clone') ? 'spin' : ''} />
              {busy.has('elevenlabs-clone') ? 'Processando e enviando amostra…' : 'Selecionar arquivo de áudio e criar clone'}
            </button>
          </div>
          <p className="field-help">A amostra de áudio é validada com FFprobe e enviada diretamente à ElevenLabs. O Studio não guarda cópias do seu arquivo.</p>
        </div>
      </article>
    </div>
  );
}
