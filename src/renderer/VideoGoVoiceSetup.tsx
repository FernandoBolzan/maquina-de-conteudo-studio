import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mic2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  Volume2
} from 'lucide-react';
import type { ElevenLabsVoice } from '../shared/contracts';
import { invoke, errorMessage, type ScreenProps } from './state';
import { ExternalLabel } from './components';

export function VideoGoVoiceSetup({ snapshot, run, refresh, busy, confirm }: ScreenProps) {
  const [elevenKey, setElevenKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [elevenError, setElevenError] = useState('');
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [speakerAuthorized, setSpeakerAuthorized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'cloned' | 'premade'>('all');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const elevenLabs = snapshot.integrations.elevenLabs;

  const loadVoices = useCallback(async () => {
    setVoiceError('');
    setVoicesLoading(true);
    try {
      setVoices(await invoke<ElevenLabsVoice[]>('elevenlabs.voices'));
    } catch (error) {
      setVoiceError(errorMessage(error));
    } finally {
      setVoicesLoading(false);
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
    setPreviewError('');
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
      setPreviewError('Não foi possível reproduzir esta amostra.');
    });
    audio.onended = () => {
      setPlayingVoiceId(null);
    };
    audio.onerror = () => {
      setPlayingVoiceId(null);
      setPreviewError('Não foi possível reproduzir esta amostra.');
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
      setShowKey(false);
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
    <div className="setup-stack elevenlabs-dashboard" role="tabpanel" id="panel-elevenlabs" aria-labelledby="tab-elevenlabs">
      <div className="elevenlabs-intro">
        <p><strong>Opcional para o VideoGo.</strong> Sem chave configurada, o VideoGo continua disponível; para usar narração ElevenLabs, a ação necessária é guardar uma API key no cofre seguro do sistema.</p>
      </div>

      <article className="setup-card elevenlabs-card elevenlabs-connection" id="videogo-voice-title" aria-labelledby="elevenlabs-connection-heading">
        <div className="setup-card-head">
          <div className="setup-card-title-group">
            <AudioLines size={18} className="card-brand-icon" />
            <div>
              <h3 id="elevenlabs-connection-heading">Conexão e chave</h3>
              <p className="field-help">A chave é necessária apenas para recursos ElevenLabs de voz no VideoGo.</p>
            </div>
          </div>
          <span className={`status-pill ${elevenLabs.configured ? 'ok' : 'warn'}`} role="status">
            {elevenLabs.configured ? 'Conectado' : 'Opcional · não configurado'}
          </span>
        </div>

        {!elevenLabs.secureStorageAvailable && (
          <div className="notice error elevenlabs-vault-warning" role="alert">
            <AlertCircle size={18} />
            <span>Cofre seguro indisponível. Ative um chaveiro do sistema (no Linux, Secret Service ou KWallet) para guardar uma chave. Não cole nem envie a chave enquanto o cofre não estiver disponível.</span>
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
                type={showKey && elevenLabs.secureStorageAvailable ? 'text' : 'password'}
                value={elevenKey}
                disabled={busy.has('elevenlabs-save') || !elevenLabs.secureStorageAvailable}
                autoComplete="new-password"
                spellCheck={false}
                onChange={event => { setElevenKey(event.target.value); setElevenError(''); }}
                placeholder={elevenLabs.configured ? '•••••••••••••••••••• (chave configurada no cofre seguro)' : 'Cole sua API key da ElevenLabs aqui'}
                aria-describedby="elevenlabs-key-help"
              />
              <button
                type="button"
                className="icon-button password-toggle-btn"
                aria-label={showKey ? 'Ocultar chave' : 'Exibir chave'}
                aria-pressed={showKey}
                disabled={!elevenKey}
                onClick={() => setShowKey(val => !val)}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          <p className="field-help" id="elevenlabs-key-help">A chave não é exibida novamente nem incluída em logs; ela é guardada no cofre seguro do sistema.</p>
          {!elevenLabs.secureStorageAvailable && <p className="elevenlabs-prerequisite">Indisponível: reative o cofre do sistema antes de inserir ou guardar a chave.</p>}
          {elevenError && <p className="warning-text" role="alert">{elevenError}</p>}
        </div>

        <div className="card-actions">
          <button
            type="button"
            className="button small primary"
            disabled={!elevenLabs.secureStorageAvailable || !elevenKey.trim() || busy.has('elevenlabs-save') || busy.has('elevenlabs-clear')}
            title={!elevenLabs.secureStorageAvailable ? 'Reative o cofre seguro do sistema para guardar a chave.' : !elevenKey.trim() ? 'Insira uma API key para continuar.' : undefined}
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
          <summary>Permissões necessárias e segurança</summary>
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

      <article className="setup-card elevenlabs-library" aria-labelledby="elevenlabs-library-heading">
        <div className="setup-card-head">
          <div className="setup-card-title-group">
            <Mic2 size={18} className="card-brand-icon" />
            <div>
              <h3 id="elevenlabs-library-heading">Biblioteca de vozes <span className="elevenlabs-count">({voices.length})</span></h3>
              <p className="field-help">Busque, filtre e ouça amostras; reproduzir prévias não gera narração do VideoGo.</p>
            </div>
          </div>
          {elevenLabs.configured && (
            <div className="voice-stats-strip" aria-label={`${totalPremade} vozes de catálogo, ${totalClones} clones`}>
              <span className="status-pill mini">{totalPremade} catálogo</span>
              {totalClones > 0 && <span className="status-pill ok mini">{totalClones} clones</span>}
            </div>
          )}
        </div>

        {elevenLabs.configured ? (
          <>
            {voicesLoading && <p className="elevenlabs-loading" role="status" aria-live="polite">Carregando biblioteca de vozes…</p>}
            {voiceError && <div className="notice error elevenlabs-library-error" role="alert"><AlertCircle size={18} /><span>Não foi possível carregar a biblioteca: {voiceError}</span></div>}
            {previewError && <p className="notice error" role="alert">{previewError}</p>}
            <div className="voice-filter-bar">
              <label className="voice-search-wrap" htmlFor="elevenlabs-voice-search">
                <Search size={14} className="search-icon" aria-hidden="true" />
                <span className="sr-only">Buscar voz por nome, categoria ou idioma</span>
                <input
                  id="elevenlabs-voice-search"
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar voz por nome, categoria ou idioma…"
                  className="voice-search-input"
                />
              </label>
              <div className="voice-filter-pills" role="radiogroup" aria-label="Filtrar vozes">
                <button type="button" role="radio" aria-checked={categoryFilter === 'all'} className={`voice-filter-pill ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>Todas ({voices.length})</button>
                <button type="button" role="radio" aria-checked={categoryFilter === 'cloned'} className={`voice-filter-pill ${categoryFilter === 'cloned' ? 'active' : ''}`} onClick={() => setCategoryFilter('cloned')}>Clones ({totalClones})</button>
                <button type="button" role="radio" aria-checked={categoryFilter === 'premade'} className={`voice-filter-pill ${categoryFilter === 'premade' ? 'active' : ''}`} onClick={() => setCategoryFilter('premade')}>Catálogo ({totalPremade})</button>
              </div>
            </div>

            {filteredVoices.length > 0 ? (
              <div className="voice-card-grid" aria-live="polite">
                {playingVoiceId && <p className="sr-only" role="status" aria-live="polite">Reproduzindo amostra da voz {voices.find(voice => voice.id === playingVoiceId)?.name ?? ''}.</p>}
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
                      {voice.previewUrl ? (
                        <button
                          type="button"
                          className={`voice-play-btn ${playingVoiceId === voice.id ? 'active' : ''}`}
                          onClick={() => togglePlayPreview(voice.id, voice.previewUrl)}
                          aria-label={playingVoiceId === voice.id ? `Parar amostra de ${voice.name}` : `Ouvir amostra de ${voice.name}`}
                          aria-pressed={playingVoiceId === voice.id}
                        >
                          {playingVoiceId === voice.id ? <Square size={12} /> : <Play size={12} />}
                          <span>{playingVoiceId === voice.id ? 'Parar' : 'Amostra'}</span>
                        </button>
                      ) : <span className="voice-preview-unavailable" title="Esta voz não tem URL de amostra disponível">Amostra indisponível</span>}
                      {voice.isClone && (
                        <button
                          type="button"
                          className="button small ghost danger-hover"
                          disabled={busy.has(`elevenlabs-delete-${voice.id}`)}
                          onClick={() => { void deleteClone(voice); }}
                          aria-label={`Excluir clone ${voice.name}`}
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
              <div className="empty-state voice-empty elevenlabs-empty" role="status" aria-live="polite">
                {voicesLoading ? <p>Aguarde enquanto as vozes são carregadas.</p> : voiceError ? <p>A biblioteca não está disponível. Corrija o erro acima ou tente atualizar as vozes.</p> : voices.length === 0 ? <><h4>Nenhuma voz na biblioteca</h4><p>Quando houver vozes disponíveis na conta, elas aparecerão aqui.</p></> : <><h4>Nenhuma voz corresponde à busca</h4><p>Altere o texto ou escolha outro filtro.</p></>}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state voice-empty elevenlabs-empty">
            <div className="empty-icon"><AudioLines size={24} /></div>
            <h4>Biblioteca indisponível sem API key</h4>
            <p>Para listar e ouvir vozes, guarde uma chave ElevenLabs no cofre seguro acima. Isso é opcional para usar o VideoGo sem narração ElevenLabs.</p>
          </div>
        )}
      </article>

      <article className="setup-card elevenlabs-cloning" aria-labelledby="elevenlabs-clone-heading">
        <div className="setup-card-head">
          <div className="setup-card-title-group">
            <Sparkles size={18} className="card-brand-icon" />
            <div>
              <h3 id="elevenlabs-clone-heading">Clonar uma voz</h3>
              <p className="field-help">Opcional. Requer chave configurada e consentimento explícito; a clonagem envia áudio à ElevenLabs e pode consumir créditos.</p>
            </div>
          </div>
        </div>
        {!elevenLabs.configured && <p className="elevenlabs-prerequisite" role="status">Indisponível: configure uma API key no cofre seguro para habilitar a clonagem.</p>}

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
              <strong>Declaração de consentimento e titularidade</strong>
              <p>Confirmo expressamente que esta é minha própria voz ou que possuo autorização legal explícita do titular para gravação, clonagem e geração de fala.</p>
            </div>
          </label>

          <div className="card-actions">
            <button
              type="button"
              className="button small primary"
              disabled={!elevenLabs.configured || !speakerAuthorized || !voiceName.trim() || busy.has('elevenlabs-clone')}
              title={!elevenLabs.configured ? 'Configure uma API key no cofre seguro para clonar uma voz.' : !speakerAuthorized ? 'Confirme a titularidade ou autorização explícita.' : !voiceName.trim() ? 'Informe um nome para a voz clonada.' : undefined}
              onClick={() => { void cloneVoice(); }}
            >
              <UploadCloud size={14} className={busy.has('elevenlabs-clone') ? 'spin' : ''} />
              {busy.has('elevenlabs-clone') ? 'Processando e enviando amostra…' : 'Selecionar arquivo de áudio e criar clone'}
            </button>
          </div>
          <p className="field-help">A amostra é validada localmente com FFprobe e enviada à ElevenLabs somente após confirmação. O Studio não guarda cópias do arquivo.</p>
        </div>
      </article>
    </div>
  );
}

