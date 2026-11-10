import type { AgentActivityKind, Provider } from './contracts.js';
import { ANSI_SEQUENCE } from './terminal-text.js';

export interface AgentActivityDraft { kind: AgentActivityKind; text: string; }
export interface AgentLineResult { activity?: AgentActivityDraft; transcript?: string; }

const MAX_ACTIVITY_LENGTH = 120;
type CommandRule = 'web' | 'read' | 'write' | 'git';
/** Program names that decide the activity of a shell command; the first matching rule in COMMAND_PRIORITY wins. */
const PROGRAM_RULES: Record<string, CommandRule> = {
  curl: 'web', wget: 'web', http: 'web', https: 'web',
  cat: 'read', head: 'read', tail: 'read', sed: 'read', less: 'read', ls: 'read', find: 'read', rg: 'read', grep: 'read', wc: 'read',
  cp: 'write', mv: 'write', mkdir: 'write', tee: 'write',
  git: 'git',
};
const COMMAND_PRIORITY: CommandRule[] = ['web', 'read', 'write', 'git'];
const COMMAND_ACTIVITY: Record<CommandRule, AgentActivityDraft> = {
  web: { kind: 'web', text: 'Consultando um site' },
  read: { kind: 'read', text: 'Lendo arquivos' },
  write: { kind: 'write', text: 'Salvando arquivos' },
  git: { kind: 'command', text: 'Consultando o repositório' },
};
const REDIRECTION = /(?:^|[^>])>{1,2}(?!&|\s*\/dev\/null\b)/;
const WRITE_TOOLS: Record<string, true> = { Write: true, Edit: true, MultiEdit: true, NotebookEdit: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Collapses whitespace and cuts to 120 characters, ending with an ellipsis when cut. */
function clip(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_ACTIVITY_LENGTH ? `${flat.slice(0, MAX_ACTIVITY_LENGTH - 1).trimEnd()}…` : flat;
}

function activity(kind: AgentActivityKind, label: string): AgentLineResult {
  const clipped = clip(label);
  return { activity: { kind, text: clipped }, transcript: `› ${clipped}` };
}

function message(value: unknown): AgentLineResult {
  const body = text(value);
  return body ? { transcript: body } : {};
}

function basename(path: unknown): string | undefined {
  const value = text(path);
  return value?.split(/[\\/]/).filter(Boolean).pop();
}

function hostOf(url: unknown): string | undefined {
  const value = text(url);
  if (!value) return undefined;
  try { return new URL(value).hostname || undefined; } catch { return undefined; }
}

function webActivity(url: unknown): AgentLineResult {
  const host = hostOf(url);
  return activity('web', host ? `Consultando um site: ${host}` : 'Consultando um site');
}

/** Combines per-block results of one message: every activity reaches the transcript, the last one is the current activity. */
function combine(results: AgentLineResult[]): AgentLineResult {
  const activities = results.flatMap(result => (result.activity ? [result.activity] : []));
  const transcript = results.flatMap(result => (result.transcript ? [result.transcript] : [])).join('\n');
  return {
    ...(activities.length ? { activity: activities[activities.length - 1] } : {}),
    ...(transcript ? { transcript } : {}),
  };
}

function unwrapShell(command: string): string {
  const match = /^(?:\S*\/)?(?:ba|z|da)?sh\s+-\w*c\s+(['"])([\s\S]*)\1$/.exec(command.trim());
  return (match?.[2] ?? command).trim();
}

function classifyCommand(command: string): AgentLineResult {
  const inner = unwrapShell(command);
  const programs = inner.split(/&&|\|\||;|\|/)
    .map(segment => basename(segment.trim().split(/\s+/)[0] ?? ''))
    .filter((program): program is string => !!program);
  const rules = programs.flatMap(program => (Object.hasOwn(PROGRAM_RULES, program) ? [PROGRAM_RULES[program]!] : []));
  const rule = COMMAND_PRIORITY.find(candidate => rules.includes(candidate));
  if (rule === 'web') {
    const url = inner.match(/https?:\/\/[^\s'"<>|;&)]+/)?.[0];
    return webActivity(url);
  }
  if (rule) return activity(COMMAND_ACTIVITY[rule].kind, COMMAND_ACTIVITY[rule].text);
  if (REDIRECTION.test(inner)) return activity('write', COMMAND_ACTIVITY.write.text);
  return activity('command', 'Executando um comando');
}

function fileActivity(path: unknown, verb: 'Salvando' | 'Editando', tool: string): AgentLineResult {
  const value = text(path);
  const name = basename(value) ?? 'arquivo';
  if (value && /generated[\\/]/.test(value) && /\.png$/i.test(value) && Object.hasOwn(WRITE_TOOLS, tool)) return activity('image', `Imagem salva: ${name}`);
  return activity('write', `${verb} ${name}`);
}

function claudeToolUse(name: unknown, input: Record<string, unknown>): AgentLineResult {
  const tool = typeof name === 'string' ? name : 'ferramenta';
  switch (tool) {
    case 'WebFetch': return webActivity(input.url);
    case 'WebSearch': {
      const query = text(input.query);
      return activity('search', query ? `Pesquisando na web: ${query}` : 'Pesquisando na web');
    }
    case 'Read': return activity('read', `Lendo ${basename(input.file_path) ?? 'arquivo'}`);
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit': return fileActivity(input.file_path, 'Salvando', tool);
    case 'Edit': return fileActivity(input.file_path, 'Editando', tool);
    case 'Glob':
    case 'Grep': return activity('read', 'Procurando arquivos');
    case 'Task': return activity('step', 'Delegando uma subtarefa');
    case 'TodoWrite': return {};
    case 'Bash': return classifyCommand(text(input.command) ?? '');
    default: return activity('step', `Usando ${tool}`);
  }
}

function contentBlocks(event: Record<string, unknown>): Record<string, unknown>[] {
  const body = isRecord(event.message) ? event.message : undefined;
  return Array.isArray(body?.content) ? body.content.filter(isRecord) : [];
}

function claudeEvent(event: Record<string, unknown>): AgentLineResult {
  switch (event.type) {
    case 'assistant':
      return combine(contentBlocks(event).map(block => {
        if (block.type === 'text') return message(block.text);
        if (block.type === 'tool_use') return claudeToolUse(block.name, isRecord(block.input) ? block.input : {});
        return {};
      }));
    case 'user':
      return combine(contentBlocks(event).map(block => (block.type === 'tool_result' && block.is_error === true ? activity('error', 'Uma ferramenta retornou erro') : {})));
    case 'result':
      if (event.is_error === true) return combine([activity('error', 'O agente terminou com erro'), message(event.result)]);
      return message(event.result);
    case 'error':
      return activity('error', text(event.message) ?? 'Erro reportado pelo agente');
    default:
      return {};
  }
}

function codexItem(type: 'item.started' | 'item.completed', item: Record<string, unknown>): AgentLineResult {
  const started = type === 'item.started';
  const itemType = typeof item.type === 'string' ? item.type : '';
  if (itemType === 'agent_message') return started ? {} : message(item.text);
  if (itemType === 'command_execution') {
    if (started) return classifyCommand(text(item.command) ?? '');
    const code = item.exit_code;
    if (typeof code !== 'number' || code === 0) return {};
    const shown = unwrapShell(text(item.command) ?? '');
    return activity('error', shown ? `Comando falhou (código ${code}): ${shown}` : `Comando falhou (código ${code})`);
  }
  if (itemType === 'error') return activity('error', text(item.message) ?? text(item.text) ?? 'Erro reportado pelo agente');
  if (!started) return itemType.includes('image') ? activity('image', 'Imagem gerada') : {};
  if (itemType === 'web_search') {
    const query = text(item.query) ?? (isRecord(item.action) ? text(item.action.query) : undefined);
    return activity('search', query ? `Pesquisando na web: ${query}` : 'Pesquisando na web');
  }
  if (itemType === 'file_change') return activity('write', 'Alterando arquivos');
  if (itemType.includes('image')) return activity('image', 'Gerando imagem');
  if (itemType === 'mcp_tool_call') return activity('step', `Usando ${text(item.tool) ?? 'uma ferramenta'}`);
  return {};
}

function codexEvent(event: Record<string, unknown>): AgentLineResult {
  switch (event.type) {
    case 'item.started':
    case 'item.completed':
      return isRecord(event.item) ? codexItem(event.type, event.item) : {};
    case 'turn.failed':
      return activity('error', 'O turno do agente falhou');
    case 'error':
      return activity('error', text(event.message) ?? 'Erro reportado pelo agente');
    default:
      return {};
  }
}

/**
 * Reads one stdout line of an agent CLI running with machine-readable output.
 * Returns undefined when the line is not a JSON object, so the caller can show it raw.
 */
export function interpretAgentLine(provider: Provider, line: string): AgentLineResult | undefined {
  const trimmed = line.replace(ANSI_SEQUENCE, '').trim();
  if (!trimmed) return undefined;
  let value: unknown;
  try { value = JSON.parse(trimmed); } catch { return undefined; }
  if (!isRecord(value)) return undefined;
  return provider === 'codex' ? codexEvent(value) : claudeEvent(value);
}
