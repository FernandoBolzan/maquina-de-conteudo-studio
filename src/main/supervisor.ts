import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { IPty } from 'node-pty';
import { setTimeout as delay } from 'node:timers/promises';
import type { AgentActivity, AppEvent, Job, JobInteractionRequest, Provider } from '../shared/contracts.js';
import { ANSI_SEQUENCE } from '../shared/terminal-text.js';
import { interpretAgentLine } from '../shared/agent-events.js';
import type { CommandResult, RunSpec } from './context.js';
import { executableArgs } from './executable.js';
const MAX_LOG = 128 * 1024;
function redact(text: string): string {
  return text.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,}|(?:sk|xi)[_-][A-Za-z0-9_-]{16,})/g, '[credencial ocultada]');
}
function detectInteraction(log: string): JobInteractionRequest | undefined {
  const clean = log.replace(ANSI_SEQUENCE, '').replace(/\r/g, '\n').slice(-8000);
  const verificationUrl = clean.match(/https:\/\/(?:github\.com\/login\/device|auth\.openai\.com\/codex\/device)\b/i)?.[0];
  const userCode = clean.match(/\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b/)?.[1];
  if (verificationUrl && userCode) return { kind: 'device-auth', prompt: 'Abra a página segura de autenticação e informe este código. O código não será salvo no histórico.', verificationUrl, userCode };
  const recent = clean.split('\n').slice(-4).join('\n').trim();
  if (/\b(password|passphrase|senha|pin)\b/i.test(recent)) return { kind: 'password', prompt: recent || 'Digite a credencial solicitada pelo processo.' };
  if (/\((?:y\/n|yes\/no)\)|\[(?:y\/n|y\/N|Y\/n|yes\/no)\]/i.test(recent)) return {
    kind: 'choice', prompt: recent, choices: [{ label: 'Sim', value: 'y' }, { label: 'Não', value: 'n' }],
  };
  if (/(?:enter|type|provide|paste|input|digite|informe)\s+[^:\n]{1,80}[:?]\s*$/im.test(recent)) return { kind: 'text', prompt: recent };
  return undefined;
}
interface Running { job: Job; child?: ChildProcess; pty?: IPty; pending: string; lineBuffer: string; agentStream?: Provider; timer?: NodeJS.Timeout; deadline?: NodeJS.Timeout; done: Promise<Job>; resolve: (job: Job) => void; cancelling: boolean; suppressOutput: boolean; finalizing: boolean; controller: AbortController; onSuccess?: (signal: AbortSignal) => Promise<string | void>; }
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
          if (job.interactive) job.interactionRequest = undefined;
          this.records.set(job.id, job);
        }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Histórico de tarefas inválido; preserve jobs.json antes de recuperar.', { cause: error }); }
  }
  list(): Job[] { return [...this.records.values()].reverse().map(job => ({ ...job })); }
  /** Removes finished jobs of a deleted project; running jobs are refused by callers beforehand. */
  async forgetProject(projectId: string): Promise<void> {
    if ([...this.active.values()].some(running => running.job.projectId === projectId)) throw new Error('Não é possível remover o histórico de um projeto com tarefa ativa.');
    const projectJobs = [...this.records.entries()].filter(([, job]) => job.projectId === projectId);
    const rows = [...this.records.values()].filter(job => job.projectId !== projectId).slice(-200).map(job => job.interactive ? { ...job, log: '', interactionRequest: undefined } : job);
    const saved = this.saving.then(async () => {
      const file = join(this.dataDir, 'jobs.json');
      await writeFile(`${file}.tmp`, JSON.stringify(rows), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    });
    this.saving = saved.catch(error => { this.emit({ type: 'output', jobId: 'system', data: `Não foi possível persistir histórico: ${String(error)}\n` }); });
    await saved;
    for (const [id, job] of projectJobs) if (this.records.get(id) === job) this.records.delete(id);
  }
  private persist(): void {
    const rows = [...this.records.values()].slice(-200).map(job => job.interactive ? { ...job, log: '', interactionRequest: undefined } : job);
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
    const safe = redact(running.suppressOutput ? '[saída ocultada após entrada de credencial]\n' : data);
    running.job.log = (running.job.log + safe).slice(-MAX_LOG);
    running.pending += safe;
    if (running.job.interactive && !running.job.interactionRequest) {
      const request = detectInteraction(running.job.log);
      if (request) { running.job.interactionRequest = request; this.emit({ type: 'job', job: { ...running.job } }); }
    }
    if (running.pending.length >= 32 * 1024) this.flush(running);
    else if (!running.timer) running.timer = setTimeout(() => this.flush(running), 32);
  }
  /** Agent CLIs print one JSON event per line; a partial line waits for its newline or for finish. */
  private agentOutput(running: Running, provider: Provider, chunk: string): void {
    const text = running.lineBuffer + chunk;
    let start = 0;
    let end = text.indexOf('\n');
    while (end !== -1) {
      this.agentLine(running, provider, text.slice(start, end));
      start = end + 1;
      end = text.indexOf('\n', start);
    }
    running.lineBuffer = text.slice(start);
  }
  private agentLine(running: Running, provider: Provider, raw: string): void {
    const line = raw.replace(ANSI_SEQUENCE, '').replace(/\r$/, '');
    if (!line.trim()) return;
    const parsed = interpretAgentLine(provider, line);
    if (!parsed) { this.output(running, `${line}\n`); return; }
    if (parsed.activity) {
      const entry: AgentActivity = { id: randomUUID(), at: new Date().toISOString(), kind: parsed.activity.kind, text: redact(parsed.activity.text) };
      running.job.activity = [...(running.job.activity ?? []), entry].slice(-50);
      running.job.currentActivity = entry.text;
      this.emit({ type: 'activity', jobId: running.job.id, activity: { ...entry } });
    }
    if (parsed.transcript) this.output(running, `${parsed.transcript}\n`);
  }
  private async finish(running: Running, code: number, error?: string): Promise<void> {
    if (!this.active.has(running.job.id) || running.finalizing) return;
    running.finalizing = true;
    if (running.agentStream && running.lineBuffer) { const rest = running.lineBuffer; running.lineBuffer = ''; this.agentLine(running, running.agentStream, rest); }
    if (code === 0 && !running.cancelling && running.onSuccess) {
      try {
        const message = await running.onSuccess(running.controller.signal);
        if (message) this.output(running, `\r\n${message}\r\n`);
      } catch (failure) {
        code = 1;
        error = failure instanceof Error ? failure.message : String(failure);
      }
    }
    clearTimeout(running.deadline);
    if (error) this.output(running, `\r\n${error}\r\n`);
    this.flush(running);
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
    const job: Job = { id: randomUUID(), title: spec.title, projectId: spec.projectId, status: 'running', createdAt: new Date().toISOString(), log: '', interactive: !!spec.interactive, ...(spec.agentSession ? { agentSession: true } : {}) };
    const { promise: done, resolve } = Promise.withResolvers<Job>();
    const running: Running = { job, pending: '', lineBuffer: '', agentStream: spec.agentStream, done, resolve, cancelling: false, suppressOutput: false, finalizing: false, controller: new AbortController(), onSuccess: spec.onSuccess };
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
        for (const [stream, structured] of [[child.stdout, true], [child.stderr, false]] as const) {
          const decoder = new StringDecoder('utf8');
          const write = (text: string) => (structured && spec.agentStream ? this.agentOutput(running, spec.agentStream, text) : this.output(running, text));
          stream?.on('data', (chunk: Buffer) => write(decoder.write(chunk)));
          stream?.on('end', () => write(decoder.end()));
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
  respond(id: string, data: string): void {
    const run = this.active.get(id);
    const request = run?.job.interactionRequest;
    if (!run?.pty || !request || request.kind === 'device-auth') throw new Error('Este processo não está aguardando uma resposta de texto.');
    const hasControl = [...data].some(character => {
      const code = character.codePointAt(0)!;
      return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31);
    });
    if (data.length > 4096 || hasControl) throw new Error('Resposta inválida.');
    if (request.kind === 'choice' && !request.choices?.some(choice => choice.value === data)) throw new Error('Escolha inválida.');
    if (request.kind === 'password') run.suppressOutput = true;
    run.job.interactionRequest = undefined;
    this.emit({ type: 'job', job: { ...run.job } });
    run.pty.write(`${data}\n`);
  }
  dismissInteraction(id: string): void {
    const run = this.active.get(id);
    if (!run?.job.interactionRequest) throw new Error('Solicitação de interação não encontrada.');
    run.job.interactionRequest = undefined;
    this.emit({ type: 'job', job: { ...run.job } });
  }
  resize(id: string, cols: number, rows: number): void {
    const run = this.active.get(id); if (!run?.pty) return;
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) throw new Error('Dimensões inválidas.');
    run.pty.resize(Math.max(20, Math.min(400, Math.floor(cols))), Math.max(5, Math.min(200, Math.floor(rows))));
  }
  async cancel(id: string): Promise<void> {
    const running = this.active.get(id); if (!running) return;
    running.cancelling = true;
    running.controller.abort();
    if (running.finalizing) { await running.done; return; }
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

export async function capture(executable: string, args: string[], options: { input?: string; cwd?: string; env?: Record<string,string>; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<CommandResult> {
  const command = executableArgs(executable, args);
  const { promise, resolve } = Promise.withResolvers<CommandResult>();
    const child = spawn(command.executable, command.args, { cwd: options.cwd, env: { ...process.env, ...options.env }, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: [options.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    if (options.input !== undefined && child.stdin) {
      child.stdin.on('error', () => { /* Encerramento anterior pelo processo */ });
      child.stdin.end(options.input);
    }
    let stdout = ''; let stderr = ''; let settled = false;
    const outDecoder = new StringDecoder('utf8'); const errDecoder = new StringDecoder('utf8');
    const finish = (code: number) => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); resolve({ code, stdout: redact(stdout + outDecoder.end()), stderr: redact(stderr + errDecoder.end()) }); };
    const timer = setTimeout(() => {
      if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Exited. */ } }
      else if (child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      child.kill('SIGKILL'); stderr += '\nTempo limite excedido.'; finish(124);
    }, options.timeoutMs ?? 20000);
    const abort = () => {
      if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Exited. */ } }
      else if (child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      child.kill('SIGKILL');
      stderr += '\nOperação cancelada.';
      finish(130);
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout?.on('data', (chunk: Buffer) => { stdout = (stdout + outDecoder.write(chunk)).slice(-1024 * 1024); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + errDecoder.write(chunk)).slice(-256 * 1024); });
    child.on('error', error => { stderr += error.message; finish(127); });
    child.on('close', code => finish(code ?? 1));
  return promise;
}
