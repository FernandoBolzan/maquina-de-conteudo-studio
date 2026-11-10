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
  tunnelToken?: string;
}

export class MobileService {
  readonly authManager: MobileAuthManager;
  readonly server: MobileServer;
  private tunnel?: CloudflareTunnel;
  private status: MobileTunnelStatus = { active: false };
  private stopping = false;

  constructor(
    private runtime: Runtime,
    private services: Services,
    private emit: (event: AppEvent) => void,
    version = '0.2.0',
    options?: MobileServiceOptions,
  ) {
    this.authManager = new MobileAuthManager(options?.initialPin);
    this.server = new MobileServer(this.authManager, runtime, services, version);
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

  async start(options: { port?: number; tunnelToken?: string } = {}): Promise<MobileTunnelStatus> {
    if (this.status.active && this.status.url) {
      return this.getStatus();
    }

    this.stopping = false;
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
      this.tunnel = new CloudflareTunnel({
        cloudflaredPath: cloudflared,
        port,
        tunnelToken: options.tunnelToken,
      });

      this.tunnel.onStatusChange((ts) => {
        if (ts.state === 'error' && !this.stopping) {
          this.status.error = ts.error;
          this.emitStatus();
        }
      });

      const publicUrl = await this.tunnel.start();
      this.server.setTunnelUrl(publicUrl);
      this.status.url = publicUrl;
      this.status.error = undefined;
      this.emitStatus();

      return this.getStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status.active = false;
      this.status.error = msg;
      this.emitStatus();
      await this.stop().catch(() => {});
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
