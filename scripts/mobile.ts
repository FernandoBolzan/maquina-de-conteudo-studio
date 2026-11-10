import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Runtime } from '../src/main/runtime.js';
import type { AppEvent } from '../src/shared/contracts.js';

function parseArgs(): { port?: number; pin?: string; tunnelToken?: string } {
  const args = process.argv.slice(2);
  const options: { port?: number; pin?: string; tunnelToken?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) options.port = Number(args[++i]);
    if (args[i] === '--pin' && args[i + 1]) options.pin = args[++i];
    if (args[i] === '--token' && args[i + 1]) options.tunnelToken = args[++i];
  }
  return options;
}

function resolveDataDir(): string {
  if (process.env.MDC_DATA_DIR) return process.env.MDC_DATA_DIR;
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'maquina-de-conteudo');
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'maquina-de-conteudo');
  }
  return process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, 'maquina-de-conteudo')
    : join(homedir(), '.config', 'maquina-de-conteudo');
}

async function main(): Promise<void> {
  const options = parseArgs();
  const dataDir = resolveDataDir();
  const pkgJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
  const version = pkgJson.version || '0.2.0';

  console.log('\n\x1b[1;36m[MÁQUINA DE CONTEÚDO]\x1b[0m Inicializando estúdio e servidor mobile...');

  const runtime = new Runtime(dataDir, {
    assetPrefix: '/api/media/',
    secureStorageAvailable: () => false,
    encryptSecret: () => { throw new Error('Cofre seguro indisponível no modo CLI.'); },
    decryptSecret: () => { throw new Error('Cofre seguro indisponível no modo CLI.'); },
    pickFile: async () => undefined,
    openPath: async () => undefined,
    openExternal: async () => undefined,
    update: async () => ({ available: false, message: 'Atualizador desativado no modo mobile.' }),
  }, (event: AppEvent) => {
    if (event.type === 'job' && event.job) {
      const tag = event.job.status === 'running' ? '\x1b[33m[EXEC]\x1b[0m'
        : event.job.status === 'succeeded' ? '\x1b[32m[OK]\x1b[0m'
        : '\x1b[31m[ERRO]\x1b[0m';
      console.log(`${tag} ${event.job.title}`);
    }
  }, version);

  await runtime.init();

  if (options.pin) {
    runtime.mobile.authManager.setPin(options.pin);
  }

  console.log('\x1b[1;36m[CLOUDFLARE TUNNEL]\x1b[0m Estabelecendo túnel rápido (trycloudflare.com)...');

  try {
    const status = await runtime.mobile.start({
      port: options.port || 4180,
      tunnelToken: options.tunnelToken,
    });

    const qrText = await runtime.mobile.getTerminalQR();
    const pin = runtime.mobile.authManager.getPin();
    const publicUrl = status.url || `http://127.0.0.1:${status.port}/`;

    console.log('\n' + '='.repeat(64));
    console.log('   \x1b[1;32m✓ ACESSO MOBILE REMOTO ATIVO\x1b[0m');
    console.log('='.repeat(64));
    console.log('\n' + qrText + '\n');
    console.log(`\x1b[1mURL PÚBLICA:\x1b[0m          \x1b[36m${publicUrl}\x1b[0m`);
    console.log(`\x1b[1mURL LOCAL (Wi-Fi):\x1b[0m    http://127.0.0.1:${status.port}/`);
    console.log(`\x1b[1mTOKEN DE 6 DÍGITOS:\x1b[0m   \x1b[1;33m[ ${pin.split('').join(' ')} ]\x1b[0m`);
    console.log('='.repeat(64));
    console.log('\x1b[90mAponte a câmera do celular para o QR Code e informe o token de 6 dígitos.\x1b[0m');
    console.log('\x1b[90mPressione Ctrl+C para encerrar o túnel e fechar a conexão.\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m[ERRO]\x1b[0m Falha ao iniciar túnel mobile:', err instanceof Error ? err.message : err);
    await runtime.dispose().catch(() => {});
    process.exit(1);
  }

  const shutdown = async () => {
    console.log('\n\x1b[33mEncerrando túnel e servidor mobile...\x1b[0m');
    await runtime.dispose().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

await main();
