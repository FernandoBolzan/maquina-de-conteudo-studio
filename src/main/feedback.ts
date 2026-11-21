import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { FEEDBACK_KINDS, FEEDBACK_LABELS, FEEDBACK_LIMITS, FEEDBACK_REPOSITORY, buildIssueBody, buildIssueTitle, detectImageType, type FeedbackImageType, type FeedbackKind, type FeedbackResult } from '../shared/feedback.js';
import { consent, text, type CommandResult, type Services } from './context.js';
import { githubLoginFromAuthStatus } from './setup.js';
import { environmentWithExecutables, requireTool } from './setup/tools.js';

export interface FeedbackContext { version: string; repository?: string; }
interface ParsedImage { bytes: Buffer; type: FeedbackImageType; }

const MAX_BASE64_LENGTH = Math.ceil(FEEDBACK_LIMITS.imageBytes / 3) * 4;

function parseKind(payload: Record<string, unknown>): FeedbackKind {
  const kind = payload.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(FEEDBACK_KINDS, kind)) throw new Error('Escolha o tipo do feedback.');
  return kind as FeedbackKind;
}

export function parseImages(value: unknown): ParsedImage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Imagens inválidas.');
  if (value.length > FEEDBACK_LIMITS.images) throw new Error(`Anexe no máximo ${FEEDBACK_LIMITS.images} imagens.`);
  return value.map((entry, index) => {
    const data = (entry as { data?: unknown } | null)?.data;
    if (typeof data !== 'string' || !data || data.length > MAX_BASE64_LENGTH) throw new Error(`A imagem ${index + 1} está vazia ou passa de ${FEEDBACK_LIMITS.imageBytes / 1024 / 1024} MB.`);
    const bytes = Buffer.from(data, 'base64');
    if (!bytes.length || bytes.length > FEEDBACK_LIMITS.imageBytes) throw new Error(`A imagem ${index + 1} está vazia ou passa de ${FEEDBACK_LIMITS.imageBytes / 1024 / 1024} MB.`);
    const type = detectImageType(bytes);
    if (!type) throw new Error(`A imagem ${index + 1} não é PNG, JPG, GIF ou WebP.`);
    return { bytes, type };
  });
}

/** Mensagem curta para o usuário; a saída bruta do `gh` não cruza o IPC. */
function failure(step: string, result: CommandResult): Error {
  const output = `${result.stdout}\n${result.stderr}`;
  if (/gist/i.test(output) && /scope|403|not accessible|permission/i.test(output)) return new Error('O GitHub conectado não tem a permissão "gist". Em Motores & Setup, desconecte e conecte o GitHub de novo.');
  if (/auth login|not logged|authentication|401|bad credentials/i.test(output)) return new Error('A sessão do GitHub expirou. Em Motores & Setup, conecte o GitHub de novo.');
  return new Error(`${step} Verifique a conexão e tente novamente.`);
}

async function deleteGist(gh: string, id: string, env: Record<string, string>, services: Services): Promise<void> {
  await services.capture(gh, ['api', '--method', 'DELETE', `gists/${id}`], { env, timeoutMs: 20000 }).catch(() => undefined);
}

/**
 * A API de issues não aceita upload. As imagens vão para um gist secreto da própria conta (acessível só por quem tem o link),
 * enviadas por git com o credential helper do `gh`; o aplicativo nunca lê o token.
 */
async function uploadImages(images: ParsedImage[], services: Services, gh: string, git: string, env: Record<string, string>, work: string): Promise<{ urls: string[]; gistId: string }> {
  const created = await services.capture(gh, ['api', '--method', 'POST', 'gists', '--input', '-'], {
    env, timeoutMs: 30000,
    input: JSON.stringify({ description: 'Anexos de feedback — Máquina de Conteúdo Studio', public: false, files: { 'LEIAME.md': { content: 'Imagens anexadas a um feedback enviado pelo Máquina de Conteúdo Studio.\n' } } }),
  });
  if (created.code !== 0) throw failure('Não foi possível guardar as imagens no GitHub.', created);
  let gist: { id: string; owner: string };
  try {
    const parsed = JSON.parse(created.stdout) as { id?: unknown; owner?: { login?: unknown } };
    if (typeof parsed.id !== 'string' || !/^[0-9a-f]+$/i.test(parsed.id) || typeof parsed.owner?.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(parsed.owner.login)) throw new Error('resposta inesperada');
    gist = { id: parsed.id, owner: parsed.owner.login };
  } catch { throw new Error('O GitHub respondeu de forma inesperada ao guardar as imagens.'); }
  try {
    const repo = join(work, 'gist');
    const names = images.map((image, index) => `imagem-${index + 1}.${image.type}`);
    // O helper é restrito ao host do gist para não oferecer o token a outro servidor.
    const credentials = ['-c', 'credential.helper=', '-c', 'credential.https://gist.github.com.helper=!gh auth git-credential'];
    const run = async (args: string[], message: string, cwd?: string): Promise<string> => {
      const result = await services.capture(git, [...credentials, ...args], { env, cwd, timeoutMs: 60000 });
      if (result.code !== 0) throw failure(message, result);
      return result.stdout;
    };
    await run(['clone', '--', `https://gist.github.com/${gist.id}.git`, repo], 'Não foi possível guardar as imagens no GitHub.');
    await Promise.all(images.map((image, index) => writeFile(join(repo, names[index]!), image.bytes)));
    await run(['add', '--', ...names], 'Não foi possível preparar as imagens.', repo);
    await run(['-c', `user.name=${gist.owner}`, '-c', `user.email=${gist.owner}@users.noreply.github.com`, 'commit', '--message', 'Imagens do feedback'], 'Não foi possível preparar as imagens.', repo);
    await run(['push', 'origin', 'HEAD'], 'Não foi possível enviar as imagens ao GitHub.', repo);
    const sha = (await run(['rev-parse', 'HEAD'], 'Não foi possível confirmar o envio das imagens.', repo)).trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Não foi possível confirmar o envio das imagens.');
    return { gistId: gist.id, urls: names.map(name => `https://gist.githubusercontent.com/${gist.owner}/${gist.id}/raw/${sha}/${name}`) };
  } catch (error) {
    await deleteGist(gh, gist.id, env, services);
    throw error;
  }
}

export async function handleFeedback(action: string, payload: Record<string, unknown>, services: Services, context: FeedbackContext): Promise<FeedbackResult> {
  if (action !== 'feedback.send') throw new Error('Ação de feedback desconhecida.');
  consent(payload);
  const kind = parseKind(payload);
  const title = text(payload, 'title', FEEDBACK_LIMITS.title);
  const message = text(payload, 'message', FEEDBACK_LIMITS.message);
  const images = parseImages(payload.images);
  const repository = context.repository ?? FEEDBACK_REPOSITORY;

  const gh = await requireTool('gh', services);
  const env = await environmentWithExecutables(services, [gh]);
  env.GIT_TERMINAL_PROMPT = '0';
  env.GH_PROMPT_DISABLED = '1';
  const status = await services.capture(gh, ['auth', 'status', '--hostname', 'github.com'], { env, timeoutMs: 15000 });
  if (status.code !== 0 || !githubLoginFromAuthStatus(`${status.stdout}\n${status.stderr}`)) throw new Error('Conecte sua conta do GitHub em Motores & Setup para enviar feedback.');

  const work = await mkdtemp(join(tmpdir(), 'maquina-feedback-'));
  let gistId: string | undefined;
  try {
    let imageUrls: string[] = [];
    if (images.length) {
      const git = await requireTool('git', services);
      const uploaded = await uploadImages(images, services, gh, git, env, work);
      imageUrls = uploaded.urls;
      gistId = uploaded.gistId;
    }
    const diagnostics = payload.includeDiagnostics === true ? { version: context.version, system: `${process.platform} ${process.arch} (${release()})`, provider: services.getSettings().provider === 'claude' ? 'Claude Code' : 'Codex' } : undefined;
    const bodyFile = join(work, 'issue.md');
    await writeFile(bodyFile, buildIssueBody({ message, imageUrls, diagnostics, version: context.version }), 'utf8');
    const createArgs = ['issue', 'create', '--repo', repository, '--title', buildIssueTitle(kind, title), '--body-file', bodyFile];
    let created = await services.capture(gh, [...createArgs, '--label', FEEDBACK_LABELS[kind]], { env, timeoutMs: 60000 });
    // Label removida do repositório não pode impedir o feedback: o workflow de rótulos ou o mantenedor corrige depois.
    if (created.code !== 0 && /label/i.test(`${created.stdout}\n${created.stderr}`)) created = await services.capture(gh, createArgs, { env, timeoutMs: 60000 });
    if (created.code !== 0) throw failure('Não foi possível criar o issue.', created);
    gistId = undefined; // o issue existe e referencia as imagens: o gist não pode mais ser apagado
    const url = created.stdout.trim().split(/\r?\n/).pop() ?? '';
    const match = url.match(new RegExp(`^https://github\\.com/${repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/(\\d+)$`));
    if (!match) throw new Error('O issue foi criado, mas o GitHub não devolveu o endereço dele. Confira em Issues no repositório.');
    return { url, number: Number(match[1]), images: imageUrls.length };
  } catch (error) {
    if (gistId) await deleteGist(gh, gistId, env, services);
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
