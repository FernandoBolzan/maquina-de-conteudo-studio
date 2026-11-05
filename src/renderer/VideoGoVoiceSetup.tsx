import { useCallback, useEffect, useState } from 'react';
import { AudioLines, ExternalLink, KeyRound, Mic2, RefreshCw, Trash2 } from 'lucide-react';
import type { ElevenLabsVoice } from '../shared/contracts';
import { invoke, errorMessage, type ScreenProps } from './state';

export function VideoGoVoiceSetup({ snapshot, run, refresh, busy, confirm }: ScreenProps) {
  const [elevenKey, setElevenKey] = useState('');
  const [elevenError, setElevenError] = useState('');
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voiceName, setVoiceName] = useState('');
  const [speakerAuthorized, setSpeakerAuthorized] = useState(false);
  const elevenLabs = snapshot.integrations.elevenLabs;

  const loadVoices = useCallback(async () => {
    setElevenError('');
    try { setVoices(await invoke<ElevenLabsVoice[]>('elevenlabs.voices')); }
    catch (error) { setElevenError(errorMessage(error)); }
  }, []);
  useEffect(() => {
    if (elevenLabs.configured) void loadVoices();
    else setVoices([]);
  }, [elevenLabs.configured, loadVoices]);

  async function saveElevenLabsKey() {
    const key = elevenKey;
    if (!key.trim()) return;
    await run('elevenlabs-save', async () => {
      await invoke('elevenlabs.configure', { key });
      setElevenKey('');
      await refresh();
      await loadVoices();
    }, 'API key validada e armazenada no cofre do sistema.');
  }
  async function clearElevenLabsKey() {
    if (!await confirm('Remover a API key ElevenLabs', 'A chave cifrada será apagada do dispositivo. Projetos e áudios já gerados não serão removidos.', 'Remover chave')) return;
    await run('elevenlabs-clear', async () => {
      await invoke('elevenlabs.clear');
      setVoices([]);
      setElevenKey('');
      await refresh();
    }, 'API key removida.');
  }
  async function cloneVoice() {
    if (!speakerAuthorized) { setElevenError('Confirme que a voz é sua ou que você tem autorização explícita.'); return; }
    if (!voiceName.trim()) { setElevenError('Informe um nome para a voz clonada.'); return; }
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
      await invoke('elevenlabs.deleteClone', { voiceId: voice.id, confirm: true });
      await loadVoices();
    }, 'Clone removido da ElevenLabs.');
  }

  return <section className="setup-section" aria-labelledby="videogo-voice-title">
    <div className="section-heading"><div><h2 id="videogo-voice-title">Voz e narração do VideoGo</h2><p className="field-help">Configure a ElevenLabs para usar vozes próprias ou clonadas nas narrações do VideoGo. A geração continua condicionada à aprovação da narração no projeto.</p></div></div>
    <article className="setup-card elevenlabs-card">
      <div className="setup-card-head">
        <strong><AudioLines size={16} />ElevenLabs</strong>
        <span className={`status-pill ${elevenLabs.configured ? 'ok' : 'warn'}`}>{elevenLabs.configured ? 'Conectado' : 'Não configurado'}</span>
      </div>
      <p>A key é validada pelo processo principal e cifrada com o cofre do sistema; não é exposta na interface.</p>
      {!elevenLabs.secureStorageAvailable && <p className="warning-text" role="alert">O cofre seguro do sistema não está disponível. No Linux, configure um keyring (Secret Service/KWallet); o Studio não salva a key em texto puro.</p>}
      {elevenLabs.error && <p className="warning-text" role="alert">{elevenLabs.error}</p>}
      <div className="elevenlabs-instructions">
        <p>Crie a API key em ElevenLabs → Settings → API Keys. Habilite acesso para listar vozes, Text to Speech e gerenciamento de vozes. Confirme créditos e elegibilidade de clonagem na sua conta; os escopos disponíveis variam por conta.</p>
        <div className="card-actions">
          <button type="button" className="button small ghost" onClick={() => { void invoke('app.external', { url: 'https://elevenlabs.io/app/settings/api-keys' }); }}><ExternalLink size={14} />Criar API key</button>
          <button type="button" className="button small ghost" onClick={() => { void invoke('app.external', { url: 'https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/instant-voice-cloning' }); }}><ExternalLink size={14} />Guia oficial de clonagem</button>
        </div>
      </div>
      <label htmlFor="elevenlabs-api-key">API key
        <input id="elevenlabs-api-key" type="password" value={elevenKey} autoComplete="new-password" spellCheck={false} onChange={event => setElevenKey(event.target.value)} placeholder={elevenLabs.configured ? '•••••••••••••••••••• (já configurada)' : 'Cole a API key da ElevenLabs'} />
      </label>
      <div className="card-actions">
        <button type="button" className="button small primary" disabled={!elevenKey.trim() || !elevenLabs.secureStorageAvailable || busy.has('elevenlabs-save')} onClick={() => { void saveElevenLabsKey(); }}><KeyRound size={14} />Validar e guardar</button>
        {elevenLabs.configured && <button type="button" className="button small" disabled={busy.has('elevenlabs-clear')} onClick={() => { void clearElevenLabsKey(); }}><Trash2 size={14} />Remover API key</button>}
        {elevenLabs.configured && <button type="button" className="button small" disabled={busy.has('elevenlabs-voices')} onClick={() => { void run('elevenlabs-voices', loadVoices, 'Biblioteca de vozes atualizada.'); }}><RefreshCw size={14} />Atualizar vozes</button>}
      </div>
      {elevenLabs.configured && <p className="field-help">A key fica no processo principal e é encaminhada apenas à chamada autorizada do VideoGo; não é gravada nos argumentos nem no histórico do job.</p>}
      {elevenError && <p className="warning-text" role="status">{elevenError}</p>}
      {elevenLabs.configured && <div className="voice-library">
        <div className="section-heading"><h3><Mic2 size={15} />Vozes da conta ({voices.length})</h3><span className="field-help">Selecione a voz no projeto. Clones podem exigir créditos.</span></div>
        {voices.length ? <ul>{voices.map(voice => <li key={voice.id}><span><strong>{voice.name}</strong><small>{voice.category}{voice.language ? ` · ${voice.language}` : ''}</small></span>{voice.isClone && <button type="button" className="button small ghost" disabled={busy.has(`elevenlabs-delete-${voice.id}`)} onClick={() => { void deleteClone(voice); }}><Trash2 size={13} />Excluir clone</button>}</li>)}</ul> : <p className="field-help">Nenhuma voz retornada. Atualize a lista ou confira as permissões da key.</p>}
        <label>Nome do novo clone
          <input value={voiceName} maxLength={100} onChange={event => setVoiceName(event.target.value)} placeholder="Ex.: Minha voz narradora" />
        </label>
        <label className="consent-check"><input type="checkbox" checked={speakerAuthorized} onChange={event => setSpeakerAuthorized(event.target.checked)} />Confirmo que esta é minha voz ou que tenho autorização explícita para gravar, clonar e gerar fala.</label>
        <button type="button" className="button small" disabled={!elevenLabs.configured || !speakerAuthorized || !voiceName.trim() || busy.has('elevenlabs-clone')} onClick={() => { void cloneVoice(); }}><Mic2 size={14} />Escolher amostra e clonar voz</button>
        <p className="field-help">Use gravação limpa, uma pessoa e sem música/ruído. A amostra é enviada à ElevenLabs e não fica armazenada pelo Studio.</p>
      </div>}
    </article>
  </section>;
}
