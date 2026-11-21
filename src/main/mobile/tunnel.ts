import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export type TunnelState = 'idle' | 'starting' | 'connected' | 'error' | 'stopped';

export interface TunnelStatus {
  state: TunnelState;
  url?: string;
  error?: string;
  startedAt?: string;
}

export interface TunnelOptions {
  cloudflaredPath?: string;
  port: number;
  /** Confirma que a URL pública já chega ao servidor local. Padrão: GET `${url}/api/status` retornando 200. */
  probe?: (url: string) => Promise<boolean>;
  /** Quanto tempo o probe pode falhar depois do registro antes de o link ser entregue mesmo assim. Padrão: 12 s. */
  probeGraceMs?: number;
}

const QUICK_TUNNEL_REGEX = /https:\/\/([a-z0-9-]+)\.trycloudflare\.com/gi;
const REGISTERED_REGEX = /Registered tunnel connection/i;
const START_TIMEOUT_MS = 30000;
const PROBE_INTERVAL_MS = 1000;
const PROBE_REQUEST_TIMEOUT_MS = 4000;
const PROBE_GRACE_MS = 12000;

/** Primeira URL de túnel rápido no texto, ignorando o endpoint de API da Cloudflare (`api.trycloudflare.com`). */
function findTunnelUrl(text: string): string | undefined {
  for (const match of text.matchAll(QUICK_TUNNEL_REGEX)) {
    if (match[1]!.toLowerCase() !== 'api') return match[0];
  }
  return undefined;
}

async function defaultProbe(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(PROBE_REQUEST_TIMEOUT_MS) });
    await response.body?.cancel().catch(() => {});
    return response.status === 200;
  } catch {
    return false;
  }
}

export class CloudflareTunnel {
  private child?: ChildProcess;
  private starting?: Promise<string>;
  private status: TunnelStatus = { state: 'idle' };
  private listeners = new Set<(status: TunnelStatus) => void>();
  private logBuffer = '';

  constructor(private options: TunnelOptions) {}

  getStatus(): TunnelStatus {
    return { ...this.status };
  }

  onStatusChange(fn: (status: TunnelStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setStatus(update: Partial<TunnelStatus>): void {
    this.status = { ...this.status, ...update };
    for (const listener of this.listeners) {
      try { listener({ ...this.status }); } catch { /* ignore listener error */ }
    }
  }

  start(): Promise<string> {
    if (this.starting) return this.starting;
    if (this.child && this.status.url) return Promise.resolve(this.status.url);
    const starting = this.launch().finally(() => {
      if (this.starting === starting) this.starting = undefined;
    });
    this.starting = starting;
    return starting;
  }

  private async launch(): Promise<string> {
    if (this.child) await this.stop();

    const executable = this.options.cloudflaredPath || 'cloudflared';
    const args = ['tunnel', '--url', `http://127.0.0.1:${this.options.port}`, '--no-autoupdate'];
    const probe = this.options.probe ?? defaultProbe;

    this.setStatus({ state: 'starting', url: undefined, error: undefined, startedAt: new Date().toISOString() });
    this.logBuffer = '';

    const { promise, resolve, reject } = Promise.withResolvers<string>();
    let settled = false;
    let registered = false;
    let candidate: string | undefined;
    let probing = false;
    let child: ChildProcess;

    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      this.setStatus({ state: 'error', error: message });
      if (this.child === child) this.child = undefined;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      reject(new Error(message));
    };

    const timeout = setTimeout(() => {
      fail(candidate
        ? `O túnel Cloudflare foi criado (${candidate}), mas a URL pública não respondeu em 30s. Tente novamente.`
        : 'Tempo limite esgotado aguardando criação do túnel Cloudflare (30s).');
    }, START_TIMEOUT_MS);

    try {
      child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ state: 'error', error: `Falha ao iniciar cloudflared: ${msg}` });
      throw new Error(`Falha ao iniciar cloudflared: ${msg}`);
    }
    this.child = child;

    const verify = async (): Promise<void> => {
      if (probing || settled || !registered || !candidate) return;
      probing = true;
      const url = candidate;
      const probeStarted = Date.now();
      while (!settled) {
        // O probe parte deste computador: um DNS local que ainda não conhece o host novo (ou que guarda a falha em cache) não pode
        // vetar um túnel que a Cloudflare já registrou. Passada a carência, o link é entregue e o celular resolve o nome pela rede dele.
        const reachable = await probe(url);
        if (reachable || Date.now() - probeStarted >= (this.options.probeGraceMs ?? PROBE_GRACE_MS)) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.setStatus({ state: 'connected', url });
          resolve(url);
          return;
        }
        await sleep(PROBE_INTERVAL_MS);
      }
    };

    const onData = (chunk: Buffer): void => {
      this.logBuffer += chunk.toString('utf8');
      if (this.logBuffer.length > 32768) this.logBuffer = this.logBuffer.slice(-16384);
      if (settled) return;
      candidate ??= findTunnelUrl(this.logBuffer);
      if (!registered && REGISTERED_REGEX.test(this.logBuffer)) registered = true;
      void verify();
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.on('error', (err) => {
      if (!settled) fail(err.message);
      else this.setStatus({ state: 'error', error: err.message });
    });

    child.on('close', (code, signal) => {
      if (this.child === child) this.child = undefined;
      const wasExpected = this.status.state === 'stopped';
      if (!settled) {
        fail(`cloudflared encerrou prematuramente (código: ${code}, sinal: ${signal}). Detalhes: ${this.logBuffer.slice(-500)}`);
      } else if (!wasExpected && this.status.state === 'connected') {
        this.setStatus({ state: 'error', url: undefined, error: `Túnel desconectado (código: ${code}).` });
      }
    });

    return promise;
  }

  async stop(): Promise<void> {
    const proc = this.child;
    this.child = undefined;
    this.setStatus({ state: 'stopped', url: undefined });
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;

    const { promise, resolve } = Promise.withResolvers<void>();
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore error if already exited */ }
      resolve();
    }, 3000);

    proc.once('close', () => {
      clearTimeout(killTimer);
      resolve();
    });

    try {
      proc.kill('SIGTERM');
    } catch {
      clearTimeout(killTimer);
      resolve();
    }
    return promise;
  }
}
