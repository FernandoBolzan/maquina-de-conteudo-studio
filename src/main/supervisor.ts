import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { IPty } from 'node-pty';
import { setTimeout as delay } from 'node:timers/promises';
import type { AppEvent, Job } from '../shared/contracts.js';
import type { CommandResult, RunSpec } from './context.js';
import { executableArgs } from './executable.js';

const MAX_LOG = 128 * 1024;
function redact(text: string): string {
  return text.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,})/g, '[credencial ocultada]');
}
interface Running { job: Job; child?: ChildProcess; pty?: IPty; pending: string; timer?: NodeJS.Timeout; deadline?: NodeJS.Timeout; done: Promise<Job>; resolve: (job: Job) => void; cancelling: boolean; }
export class Supervisor {
  private records = new Map<string, Job>();
  private active = new Map<string, Running>();
  private saving = Promise.resolve();
  constructor(private dataDir: string, private emit: (event: AppEvent) => void) {}
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const saved: unknown = JSON.parse(await readFile(join(this.dataDir, 'jobs.json'), 'utf8'));
      if (Array.isArray(saved)) for (const entry of saved) {
        if (entry && typeof entry.id === 'string' && typeof entry.title === 'string') {
          const job = entry as Job;
          if (job.status === 'running') { job.status = 'interrupted'; job.endedAt = new Date().toISOString(); }
          this.records.set(job.id, job);
        }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Histórico de tarefas inválido; preserve jobs.json antes de recuperar.', { cause: error }); }
  }
  list(): Job[] { return [...this.records.values()].reverse().map(job => ({ ...job })); }
  private persist(): void {
    const rows = [...this.records.values()].slice(-200).map(job => ({ ...job, log: job.interactive ? '' : job.log }));
    this.saving = this.saving.then(async () => {
      const file = join(this.dataDir, 'jobs.json');
      await writeFile(`${file}.tmp`, JSON.stringify(rows), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    }).catch(error => { this.emit({ type: 'output', jobId: 'system', data: `Não foi possível persistir histórico: ${String(error)}\n` }); });
  }
  private flush(running: Running): void {
    clearTimeout(running.timer);
    running.timer = undefined;
    if (!running.pending) return;
    const data = running.pending; running.pending = '';
    this.emit({ type: 'output', jobId: running.job.id, data });
  }
  private output(running: Running, data: string): void {
    const safe = redact(data);
    running.job.log = (running.job.log + safe).slice(-MAX_LOG);
    running.pending += safe;
    if (running.pending.length >= 32 * 1024) this.flush(running);
    else if (!running.timer) running.timer = setTimeout(() => this.flush(running), 32);
  }
  private finish(running: Running, code: number, error?: string): void {
    if (!this.active.has(running.job.id)) return;
    if (error) this.output(running, `\r\n${error}\r\n`);
    this.flush(running);
    clearTimeout(running.deadline);
    running.job.exitCode = code;
    running.job.status = running.cancelling ? 'cancelled' : code === 0 ? 'succeeded' : 'failed';
    running.job.endedAt = new Date().toISOString();
    this.active.delete(running.job.id);
    this.persist();
    this.emit({ type: 'job', job: { ...running.job } });
    running.resolve({ ...running.job });
  }
  async run(spec: RunSpec): Promise<Job> {
    if (!spec.executable || spec.args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Comando inválido.');
    if (this.active.size >= 6) throw new Error('Há seis tarefas em execução. Aguarde ou cancele uma delas.');
    if (spec.projectId && [...this.active.values()].some(r => r.job.projectId === spec.projectId)) throw new Error('Este projeto já possui uma tarefa ativa.');
    const job: Job = { id: randomUUID(), title: spec.title, projectId: spec.projectId, status: 'running', createdAt: new Date().toISOString(), log: '', interactive: !!spec.interactive };
    const { promise: done, resolve } = Promise.withResolvers<Job>();
    const running: Running = { job, pending: '', done, resolve, cancelling: false };
    this.records.set(job.id, job); this.active.set(job.id, running);
    this.emit({ type: 'job', job: { ...job } }); this.persist();
    const env = { ...process.env, ...spec.env };
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[key];
    try {
      const command = executableArgs(spec.executable, spec.args);
      if (spec.interactive) {
        try {
          // Native addon ABI differs between host Node.js (CLI/tests) and Electron runtime.
          const pty = await import('node-pty');
          running.pty = pty.spawn(command.executable, command.args, { name: 'xterm-256color', cols: 100, rows: 24, cwd: spec.cwd || this.dataDir, env: env as Record<string, string> });
          running.pty.onData(data => this.output(running, data));
          running.pty.onExit(({ exitCode }) => this.finish(running, exitCode));
        } catch {
          const child = spawn(command.executable, command.args, { cwd: spec.cwd || this.dataDir, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
          running.child = child;
          running.pty = { pid: child.pid ?? 0, cols: 100, rows: 24, process: command.executable, handleFlowControl: false, onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }), write: data => { child.stdin?.write(data); }, resize: () => undefined, clear: () => undefined, kill: () => { child.kill('SIGKILL'); }, pause: () => undefined, resume: () => undefined };
          for (const stream of [child.stdout, child.stderr]) {
            const decoder = new StringDecoder('utf8');
            stream?.on('data', (chunk: Buffer) => this.output(running, decoder.write(chunk)));
            stream?.on('end', () => this.output(running, decoder.end()));
          }
          child.on('error', error => this.finish(running, 1, error.message));
          child.on('close', code => this.finish(running, code ?? 1));
        }
      } else {
        const child = spawn(command.executable, command.args, { cwd: spec.cwd || this.dataDir, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
        running.child = child;
        for (const stream of [child.stdout, child.stderr]) {
          const decoder = new StringDecoder('utf8');
          stream?.on('data', (chunk: Buffer) => this.output(running, decoder.write(chunk)));
          stream?.on('end', () => this.output(running, decoder.end()));
        }
        child.on('error', error => this.finish(running, 1, error.message));
        child.on('close', code => this.finish(running, code ?? 1));
      }
      if (spec.timeoutMs && spec.timeoutMs > 0) running.deadline = setTimeout(() => { void this.cancel(job.id); }, spec.timeoutMs);
    } catch (error) { this.finish(running, 1, String(error)); }
    return { ...job };
  }
  async wait(id: string): Promise<Job> {
    const active = this.active.get(id); if (active) return active.done;
    const job = this.records.get(id); if (!job) throw new Error('Tarefa não encontrada.'); return { ...job };
  }
  input(id: string, data: string): void {
    const run = this.active.get(id);
    if (!run?.pty) throw new Error('Terminal não está ativo.');
    if (data.length > 64 * 1024) throw new Error('Entrada do terminal excede o limite.');
    run.pty.write(data);
  }
  resize(id: string, cols: number, rows: number): void {
    const run = this.active.get(id); if (!run?.pty) return;
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) throw new Error('Dimensões inválidas.');
    run.pty.resize(Math.max(20, Math.min(400, Math.floor(cols))), Math.max(5, Math.min(200, Math.floor(rows))));
  }
  async cancel(id: string): Promise<void> {
    const running = this.active.get(id); if (!running) return;
    running.cancelling = true;
    const pid = running.pty?.pid ?? running.child?.pid;
    if (pid) {
      if (process.platform === 'win32') {
        await capture('taskkill', ['/PID', String(pid), '/T', '/F'], { timeoutMs: 5000 });
      } else {
        try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* Already exited. */ } }
        // Kill the original process group after grace even if its leader already exited.
        await delay(700);
        try { process.kill(-pid, 'SIGKILL'); } catch { /* Group exited. */ }
      }
    }
    try { running.pty?.kill(); } catch { /* Terminal already disposed. */ }
    running.child?.kill('SIGKILL');
    this.finish(running, 130);
  }
  async dispose(): Promise<void> { await Promise.all([...this.active.keys()].map(id => this.cancel(id))); await this.saving; }
}

export async function capture(executable: string, args: string[], options: { cwd?: string; env?: Record<string,string>; timeoutMs?: number } = {}): Promise<CommandResult> {
  const command = executableArgs(executable, args);
  const { promise, resolve } = Promise.withResolvers<CommandResult>();
    const child = spawn(command.executable, command.args, { cwd: options.cwd, env: { ...process.env, ...options.env }, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let settled = false;
    const outDecoder = new StringDecoder('utf8'); const errDecoder = new StringDecoder('utf8');
    const finish = (code: number) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, stdout: redact(stdout + outDecoder.end()), stderr: redact(stderr + errDecoder.end()) }); };
    const timer = setTimeout(() => {
      if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Exited. */ } }
      else if (child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      child.kill('SIGKILL'); stderr += '\nTempo limite excedido.'; finish(124);
    }, options.timeoutMs ?? 20000);
    child.stdout.on('data', (chunk: Buffer) => { stdout = (stdout + outDecoder.write(chunk)).slice(-1024 * 1024); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + errDecoder.write(chunk)).slice(-256 * 1024); });
    child.on('error', error => { stderr += error.message; finish(127); });
    child.on('close', code => finish(code ?? 1));
  return promise;
}
