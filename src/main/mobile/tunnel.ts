import { spawn, type ChildProcess } from 'node:child_process';

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
  tunnelToken?: string;
}

const QUICK_TUNNEL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

export class CloudflareTunnel {
  private child?: ChildProcess;
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

  async start(): Promise<string> {
    if (this.child) {
      if (this.status.url) return this.status.url;
      await this.stop();
    }

    const executable = this.options.cloudflaredPath || 'cloudflared';
    const args = this.options.tunnelToken
      ? ['tunnel', 'run', '--token', this.options.tunnelToken]
      : ['tunnel', '--url', `http://127.0.0.1:${this.options.port}`, '--no-autoupdate'];

    this.setStatus({
      state: 'starting',
      url: undefined,
      error: undefined,
      startedAt: new Date().toISOString(),
    });
    this.logBuffer = '';

    const { promise, resolve, reject } = Promise.withResolvers<string>();
    let settled = false;

    try {
      this.child = spawn(executable, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus({ state: 'error', error: `Falha ao iniciar cloudflared: ${msg}` });
      throw new Error(`Falha ao iniciar cloudflared: ${msg}`);
    }

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        const err = 'Tempo limite esgotado aguardando criação do túnel Cloudflare (30s).';
        this.setStatus({ state: 'error', error: err });
        reject(new Error(err));
      }
    }, 30000);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      this.logBuffer += text;
      if (this.logBuffer.length > 32768) {
        this.logBuffer = this.logBuffer.slice(-16384);
      }

      if (!settled) {
        const match = text.match(QUICK_TUNNEL_REGEX) || this.logBuffer.match(QUICK_TUNNEL_REGEX);
        if (match?.[0]) {
          settled = true;
          clearTimeout(timeout);
          const tunnelUrl = match[0];
          this.setStatus({ state: 'connected', url: tunnelUrl });
          resolve(tunnelUrl);
        }
      }
    };

    this.child.stdout?.on('data', onData);
    this.child.stderr?.on('data', onData);

    this.child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        this.setStatus({ state: 'error', error: err.message });
        reject(err);
      } else {
        this.setStatus({ state: 'error', error: err.message });
      }
    });

    this.child.on('close', (code, signal) => {
      clearTimeout(timeout);
      const wasExpected = this.status.state === 'stopped';
      if (!settled) {
        settled = true;
        const reason = `cloudflared encerrou prematuramente (código: ${code}, sinal: ${signal}). Detalhes: ${this.logBuffer.slice(-500)}`;
        this.setStatus({ state: 'error', error: reason });
        reject(new Error(reason));
      } else if (!wasExpected) {
        this.setStatus({
          state: 'error',
          error: `Túnel desconectado (código: ${code}).`,
        });
      }
    });

    return promise;
  }

  async stop(): Promise<void> {
    if (!this.child) {
      this.setStatus({ state: 'stopped', url: undefined });
      return;
    }

    this.setStatus({ state: 'stopped' });
    const proc = this.child;
    this.child = undefined;

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
