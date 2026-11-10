import { mkdir, readFile, writeFile, rename, realpath, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppEvent, Settings, Snapshot } from '../shared/contracts.js';
import type { Services } from './context.js';
import { text } from './context.js';
import { Supervisor, capture } from './supervisor.js';
import { handleProjects } from './projects.js';
import { handleAgents } from './agents.js';
import { handleSetup } from './setup.js';
import { cloneElevenLabsVoice, deleteElevenLabsClone, listElevenLabsVoices, validateElevenLabsKey } from './elevenlabs.js';
import { MobileService } from './mobile/service.js';
export interface Host {
  pickFile: Services['pickFile']; openPath: Services['openPath']; openExternal: Services['openExternal'];
  assetPrefix: string; secureStorageAvailable(): boolean; encryptSecret(value: string): string; decryptSecret(value: string): string;
  update(action: string, payload: Record<string, unknown>): Promise<unknown>;
}
const MEDIA: Record<string, true> = { '.png': true, '.jpg': true, '.jpeg': true, '.webp': true, '.gif': true, '.avif': true, '.svg': true, '.mp4': true, '.webm': true, '.mov': true, '.mkv': true, '.m4v': true, '.mp3': true, '.wav': true, '.ogg': true, '.m4a': true, '.aac': true, '.flac': true, '.pdf': true, '.txt': true, '.md': true, '.json': true, '.srt': true, '.vtt': true, '.ass': true };
export function within(root: string, path: string): boolean { const part = relative(root, path); return part === '' || (!part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && part !== '..' && !isAbsolute(part)); }
export class Runtime {
  readonly supervisor: Supervisor;
  readonly services: Services;
  readonly mobile: MobileService;
  private settings!: Settings;
  private media = new Map<string, string>();
  private elevenLabsKey?: string;
  private elevenLabsSecretError?: string;
  private elevenLabsWarning?: string;
  private saving = Promise.resolve();
  private pickedDirectories: string[] = [];
  constructor(readonly dataDir: string, private host: Host, private emit: (event: AppEvent) => void = () => {}, readonly version = '0.1.0') {
    this.supervisor = new Supervisor(join(dataDir, 'history'), (event) => {
      this.emit(event);
      this.mobile?.broadcast(event);
    });
    this.services = {
      dataDir, getSettings: () => structuredClone(this.settings), saveSettings: update => this.saveSettings(update),
      run: spec => this.supervisor.run(spec), capture, waitJob: id => this.supervisor.wait(id), jobs: () => this.supervisor.list(), emit,
      pickFile: options => host.pickFile(options), openPath: path => host.openPath(path), openExternal: url => host.openExternal(url),
      assetUrl: path => this.assetUrl(path), getElevenLabsKey: () => this.elevenLabsKey,
      forgetProjectJobs: projectId => this.supervisor.forgetProject(projectId),
      revokeMedia: folder => { for (const [token, known] of this.media) if (within(folder, known)) this.media.delete(token); },
    };
    this.mobile = new MobileService(this, this.services, (event) => {
      this.emit(event);
    }, version);
  }
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    try {
      const stored = JSON.parse(await readFile(join(this.dataDir, 'settings.json'), 'utf8')) as Partial<Settings>;
      if (!stored || typeof stored.workspace !== 'string' || !isAbsolute(stored.workspace) || !['codex','claude'].includes(stored.provider ?? '') || typeof stored.enginePaths !== 'object' || !stored.enginePaths || Array.isArray(stored.enginePaths) || (stored.onboardingCompleted !== undefined && typeof stored.onboardingCompleted !== 'boolean')) throw new Error('Formato inválido.');
      this.settings = { ...stored, onboardingCompleted: stored.onboardingCompleted ?? true } as Settings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Configuração inválida; preserve settings.json para recuperação.', { cause: error });
      this.settings = { workspace: join(homedir(), 'MaquinaDeConteudo', 'storage'), provider: 'codex', enginePaths: {}, onboardingCompleted: false };
    }
    await mkdir(this.settings.workspace, { recursive: true });
    this.settings.workspace = await realpath(this.settings.workspace);
    try {
      const encrypted = await readFile(join(this.dataDir, 'elevenlabs.key'), 'utf8');
      if (!this.host.secureStorageAvailable()) throw new Error('O cofre do sistema não está disponível.');
      this.elevenLabsKey = this.host.decryptSecret(encrypted);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.elevenLabsSecretError = 'A chave salva não pôde ser aberta com segurança. Configure-a novamente.';
    }
    await this.supervisor.init();
  }
  private async registerPickedDirectories(paths: string[]): Promise<void> {
    const unique = [...new Set(await Promise.all(paths.map(path => realpath(path))))];
    this.pickedDirectories = [...unique, ...this.pickedDirectories.filter(root => !unique.includes(root))].slice(0, 20);
  }
  async saveSettings(update: Partial<Settings>): Promise<Settings> {
    this.saving = this.saving.catch(() => undefined).then(async () => {
      if (update.workspace && update.workspace !== this.settings.workspace) {
        if (this.supervisor.list().some(job => job.status === 'running')) throw new Error('Finalize as tarefas antes de trocar a pasta de trabalho.');
        if (!isAbsolute(update.workspace)) throw new Error('Escolha uma pasta absoluta.');
        const root = resolve(update.workspace);
        if (root === resolve(root, '..') || root === homedir()) throw new Error('Escolha uma subpasta exclusiva para os projetos.');
        await mkdir(root, { recursive: true }); update.workspace = await realpath(root); this.media.clear();
      }
      if (update.provider && !['codex','claude'].includes(update.provider)) throw new Error('Provedor inválido.');
      const next = { ...this.settings, ...update, enginePaths: { ...this.settings.enginePaths, ...update.enginePaths } };
      const target = join(this.dataDir, 'settings.json');
      await writeFile(`${target}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 }); await rename(`${target}.tmp`, target);
      this.settings = next; this.emit({ type: 'refresh' });
    });
    await this.saving; return structuredClone(this.settings);
  }
  private assetUrl(path: string): string {
    const canonical = realpathSync(path);
    if (!within(this.settings.workspace, canonical) || !MEDIA[extname(canonical).toLowerCase()]) throw new Error('Mídia fora da pasta autorizada.');
    for (const [token, known] of this.media) if (known === canonical) return `${this.host.assetPrefix}${token}`;
    const token = randomUUID(); this.media.set(token, canonical); return `${this.host.assetPrefix}${token}`;
  }
  async mediaPath(token: string): Promise<string> {
    const path = this.media.get(token); if (!path) throw new Error('Mídia não autorizada.');
    const canonical = await realpath(path);
    if (!within(this.settings.workspace, canonical) || canonical !== path) throw new Error('A mídia mudou de localização.');
    return canonical;
  }
  private elevenLabsStatus() {
    return {
      configured: !!this.elevenLabsKey,
      secureStorageAvailable: this.host.secureStorageAvailable(),
      ...(this.elevenLabsSecretError ? { error: this.elevenLabsSecretError } : {}),
      ...(this.elevenLabsWarning ? { warning: this.elevenLabsWarning } : {}),
    };
  }

  async invoke(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    if (typeof action !== 'string' || action.length > 80 || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Requisição inválida.');
    if (action === 'app.snapshot') return {
      settings: structuredClone(this.settings), projects: await handleProjects('projects.list', {}, this.services), brands: await handleProjects('brands.list', {}, this.services), jobs: this.supervisor.list(),
      integrations: { elevenLabs: this.elevenLabsStatus() },
      version: this.version,
      mobile: this.mobile.getStatus(),
    } as Snapshot;
    if (action === 'app.settings') {
      const update: Partial<Settings> = {};
      if (payload.workspace !== undefined) update.workspace = text(payload, 'workspace');
      if (payload.provider !== undefined) { const provider = text(payload, 'provider'); if (provider !== 'codex' && provider !== 'claude') throw new Error('Provedor inválido.'); update.provider = provider; }
      // Engine paths enter only through setup.link, which validates installations.
      return this.saveSettings(update);
    }
    if (action === 'app.pick') {
      const directory = payload.directory === true;
      const picked = await this.host.pickFile({ directory, multiple: payload.multiple === true, extensions: Array.isArray(payload.extensions) ? payload.extensions.filter((v): v is string => typeof v === 'string' && /^[a-z0-9]+$/i.test(v)) : undefined });
      if (directory && picked) await this.registerPickedDirectories(Array.isArray(picked) ? picked : [picked]);
      return picked;
    }
    if (action === 'app.open') {
      const path = await realpath(text(payload, 'path'));
      if (!within(this.settings.workspace, path) && !within(this.dataDir, path) && !this.pickedDirectories.some(root => within(root, path))) throw new Error('Pasta não autorizada.');
      return this.host.openPath(path);
    }
    if (action === 'app.external') { const url = new URL(text(payload, 'url')); if (url.protocol !== 'https:' || !['github.com','auth.openai.com','claude.ai','platform.openai.com','chatgpt.com','nodejs.org','cli.github.com','elevenlabs.io','www.fernandobolzan.com'].includes(url.hostname)) throw new Error('Endereço externo não autorizado.'); return this.host.openExternal(url.href); }
    if (action === 'app.updateCheck' || action === 'app.updateInstall' || action === 'app.updateStatus') return this.host.update(action, payload);
    if (action === 'jobs.list') return this.supervisor.list();
    if (action === 'elevenlabs.status') return this.elevenLabsStatus();
    if (action === 'elevenlabs.configure') {
      if (!this.host.secureStorageAvailable()) throw new Error('O cofre de credenciais do sistema está indisponível. Configure um keyring do sistema e tente novamente.');
      const key = text(payload, 'key', 512);
      const { warning } = await validateElevenLabsKey(key);
      const encrypted = this.host.encryptSecret(key);
      const path = join(this.dataDir, 'elevenlabs.key');
      await writeFile(`${path}.tmp`, encrypted, { mode: 0o600 });
      await rename(`${path}.tmp`, path);
      this.elevenLabsKey = key;
      this.elevenLabsSecretError = undefined;
      this.elevenLabsWarning = warning;
      this.emit({ type: 'refresh' });
      return this.elevenLabsStatus();
    }
    if (action === 'elevenlabs.clear') {
      await rm(join(this.dataDir, 'elevenlabs.key'), { force: true });
      this.elevenLabsKey = undefined;
      this.elevenLabsSecretError = undefined;
      this.elevenLabsWarning = undefined;
      this.emit({ type: 'refresh' });
      return { configured: false, secureStorageAvailable: this.host.secureStorageAvailable() };
    }
    if (action === 'elevenlabs.voices') {
      if (!this.elevenLabsKey) throw new Error(this.elevenLabsSecretError || 'Configure a API key ElevenLabs primeiro.');
      return listElevenLabsVoices(this.elevenLabsKey);
    }
    if (action === 'elevenlabs.clone') {
      if (!this.elevenLabsKey) throw new Error(this.elevenLabsSecretError || 'Configure a API key ElevenLabs primeiro.');
      if (payload.speakerAuthorized !== true) throw new Error('Confirme que a voz é sua ou que você tem autorização expressa para cloná-la.');
      if (payload.confirm !== true) throw new Error('A clonagem envia a amostra à ElevenLabs e pode consumir créditos; confirme a operação.');
      const voice = await cloneElevenLabsVoice(this.elevenLabsKey, text(payload, 'name', 100), text(payload, 'samplePath', 4096), this.services);
      this.emit({ type: 'refresh' });
      return voice;
    }
    if (action === 'elevenlabs.deleteClone') {
      if (!this.elevenLabsKey) throw new Error(this.elevenLabsSecretError || 'Configure a API key ElevenLabs primeiro.');
      if (payload.confirm !== true) throw new Error('Confirme a remoção permanente da voz clonada na ElevenLabs.');
      await deleteElevenLabsClone(this.elevenLabsKey, text(payload, 'voiceId', 128));
      this.emit({ type: 'refresh' });
      return { deleted: true };
    }
    if (action === 'jobs.cancel') return this.supervisor.cancel(text(payload, 'id', 100));
    if (action === 'jobs.input') { if (typeof payload.data !== 'string') throw new Error('Entrada inválida.'); return this.supervisor.input(text(payload, 'id', 100), payload.data); }
    if (action === 'jobs.respond') { if (typeof payload.data !== 'string') throw new Error('Resposta inválida.'); return this.supervisor.respond(text(payload, 'id', 100), payload.data); }
    if (action === 'jobs.dismissInteraction') return this.supervisor.dismissInteraction(text(payload, 'id', 100));
    if (action === 'jobs.resize') return this.supervisor.resize(text(payload, 'id', 100), Number(payload.cols), Number(payload.rows));
    if (action.startsWith('projects.') || action.startsWith('brands.')) { const result = await handleProjects(action, payload, this.services); if (!['projects.list','projects.detail','projects.readText','brands.list'].includes(action)) this.emit({ type: 'refresh' }); return result; }
    if (action.startsWith('agents.')) return handleAgents(action, payload, this.services);
    if (action === 'app.onboarding.complete') return this.saveSettings({ onboardingCompleted: true });
    if (action.startsWith('setup.')) return handleSetup(action, payload, this.services);
    if (action === 'mobile.status') return this.mobile.getStatus();
    if (action === 'mobile.start') return this.mobile.start(payload as { port?: number; tunnelToken?: string });
    if (action === 'mobile.stop') { await this.mobile.stop(); return this.mobile.getStatus(); }
    if (action === 'mobile.regeneratePin') return { token: this.mobile.regeneratePin() };
    if (action === 'mobile.qr') return { svg: await this.mobile.getSvgQR(), terminal: await this.mobile.getTerminalQR() };
    throw new Error('Operação não suportada.');
  }
  async dispose(): Promise<void> {
    await this.mobile.stop().catch(() => {});
    await this.supervisor.dispose();
    await this.saving;
  }
}
