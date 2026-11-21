import type { AppEvent, MobileTunnelStatus } from '../../shared/contracts.js';
import type { Services } from '../context.js';
import type { Runtime } from '../runtime.js';
import { resolveTool } from '../setup/tools.js';
import { MobileAuthManager } from './token.js';
import { MobileServer } from './server.js';
import { CloudflareTunnel } from './tunnel.js';
import { generateTerminalQR, generateSvgQR } from './qr.js';

export interface MobileServiceOptions {
  port?: number;
  initialPin?: string;
  /** Substitui a verificação de que a URL pública alcança o servidor local (usado em testes). */
  tunnelProbe?: (url: string) => Promise<boolean>;
}

export class MobileService {
  readonly authManager: MobileAuthManager;
  readonly server: MobileServer;
  private tunnel?: CloudflareTunnel;
  private status: MobileTunnelStatus = { active: false };
  private stopping = false;
  private starting?: Promise<MobileTunnelStatus>;

  private tunnelProbe?: (url: string) => Promise<boolean>;

  constructor(
    private runtime: Runtime,
    private services: Services,
    private emit: (event: AppEvent) => void,
    version = '0.2.0',
    options?: MobileServiceOptions,
  ) {
    this.authManager = new MobileAuthManager(options?.initialPin);
    this.server = new MobileServer(this.authManager, runtime, services, version);
    this.tunnelProbe = options?.tunnelProbe;
  }

  getStatus(): MobileTunnelStatus {
    const tunnelStatus = this.tunnel?.getStatus();
    return {
      active: this.status.active,
      url: tunnelStatus?.url || this.status.url,
      token: this.authManager.getPin(),
      port: this.server.getPort(),
      connectedClients: this.authManager.getActiveSessionsCount(),
      error: this.status.error || tunnelStatus?.error,
      startedAt: this.status.startedAt,
    };
  }

  broadcast(event: AppEvent): void {
    this.server.broadcastEvent(event);
  }

  start(options: { port?: number } = {}): Promise<MobileTunnelStatus> {
    if (this.starting) return this.starting;
    if (this.status.active && this.status.url) return Promise.resolve(this.getStatus());
    const starting = this.launch(options).finally(() => {
      if (this.starting === starting) this.starting = undefined;
    });
    this.starting = starting;
    return starting;
  }

  private async launch(options: { port?: number }): Promise<MobileTunnelStatus> {
    this.stopping = false;
    if (this.tunnel) {
      const previous = this.tunnel;
      this.tunnel = undefined;
      await previous.stop().catch(() => {});
    }
    this.status = {
      active: true,
      token: this.authManager.getPin(),
      startedAt: new Date().toISOString(),
    };
    this.emitStatus();

    try {
      // 1. Start HTTP Server
      const port = await this.server.start(options.port || 4180);
      this.status.port = port;

      // 2. Resolve cloudflared
      const cloudflared = await resolveTool('cloudflared', this.services);
      if (!cloudflared) {
        throw new Error('Cloudflare Tunnel (cloudflared) não foi encontrado. Instale-o na aba de Configuração.');
      }

      // 3. Start Tunnel
      const tunnel = new CloudflareTunnel({ cloudflaredPath: cloudflared, port, probe: this.tunnelProbe });
      this.tunnel = tunnel;

      tunnel.onStatusChange((ts) => {
        // Falha durante a partida é tratada pelo catch abaixo; aqui só a queda do túnel já conectado.
        if (ts.state !== 'error' || this.stopping || this.tunnel !== tunnel || !this.status.url) return;
        this.status = { ...this.status, active: false, url: undefined, error: ts.error };
        this.server.setTunnelUrl('');
        this.emitStatus();
      });

      const publicUrl = await tunnel.start();
      this.server.setTunnelUrl(publicUrl);
      this.status.url = publicUrl;
      this.status.error = undefined;
      this.emitStatus();

      return this.getStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.stop().catch(() => {});
      this.status = { ...this.status, active: false, error: msg };
      this.emitStatus();
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.tunnel) {
      const t = this.tunnel;
      this.tunnel = undefined;
      await t.stop().catch(() => {});
    }
    await this.server.stop().catch(() => {});
    this.status = { active: false, token: this.authManager.getPin() };
    this.emitStatus();
  }

  regeneratePin(): string {
    const newPin = this.authManager.regeneratePin();
    this.status.token = newPin;
    this.emitStatus();
    return newPin;
  }

  revokeSessions(): MobileTunnelStatus {
    this.authManager.revokeAllSessions();
    this.emitStatus();
    return this.getStatus();
  }

  async getTerminalQR(): Promise<string> {
    const url = this.status.url || `http://127.0.0.1:${this.server.getPort()}/`;
    return generateTerminalQR(url);
  }

  async getSvgQR(): Promise<string> {
    const url = this.status.url || `http://127.0.0.1:${this.server.getPort()}/`;
    return generateSvgQR(url);
  }

  private emitStatus(): void {
    const status = this.getStatus();
    this.emit({ type: 'mobile', mobile: status });
  }
}
