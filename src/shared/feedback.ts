/** Repositório que recebe os issues de feedback (o mesmo que publica as releases do Studio). */
export const FEEDBACK_REPOSITORY = 'FernandoBolzan/maquina-de-conteudo-studio';

export const FEEDBACK_KINDS = { bug: 'Bug', suggestion: 'Sugestão', question: 'Dúvida' } as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;

/** Label do repositório aplicada a cada tipo (as três existem por padrão no GitHub). */
export const FEEDBACK_LABELS: Record<FeedbackKind, string> = { bug: 'bug', suggestion: 'enhancement', question: 'question' };
export const FEEDBACK_LIMITS = {
  title: 120,
  message: 8000,
  images: 4,
  /** Tamanho máximo de cada imagem já decodificada. */
  imageBytes: 5 * 1024 * 1024,
} as const;

export type FeedbackImageType = 'png' | 'jpg' | 'gif' | 'webp';
export const FEEDBACK_IMAGE_MIME: Record<FeedbackImageType, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** Imagem enviada pelo renderer: só o conteúdo em base64 importa; o tipo é sempre redetectado pelos primeiros bytes. */
export interface FeedbackImageInput { data: string; }
export interface FeedbackResult { url: string; number: number; images: number; }

/** Identifica PNG, JPEG, GIF e WebP pelos bytes iniciais; o nome e o MIME informados pelo usuário não valem. */
export function detectImageType(bytes: Uint8Array): FeedbackImageType | undefined {
  const at = (index: number) => bytes[index];
  if (bytes.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return 'png';
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg';
  if (bytes.length >= 6 && at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38 && (at(4) === 0x37 || at(4) === 0x39) && at(5) === 0x61) return 'gif';
  if (bytes.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'webp';
  return undefined;
}

export function buildIssueTitle(kind: FeedbackKind, title: string): string {
  return `[${FEEDBACK_KINDS[kind]}] ${title.replace(/\s+/g, ' ').trim()}`;
}

export interface FeedbackDiagnostics { version: string; system: string; provider: string; }

export function buildIssueBody(input: { message: string; imageUrls: string[]; diagnostics?: FeedbackDiagnostics; version: string }): string {
  const parts = [input.message.trim()];
  if (input.imageUrls.length) parts.push(input.imageUrls.map((url, index) => `![Imagem ${index + 1}](${url})`).join('\n\n'));
  if (input.diagnostics) {
    const { version, system, provider } = input.diagnostics;
    parts.push(`<details>\n<summary>Informações do sistema</summary>\n\n- Versão do Studio: ${version}\n- Sistema: ${system}\n- Agente padrão: ${provider}\n\n</details>`);
  }
  parts.push(`---\n_Enviado pelo Máquina de Conteúdo Studio v${input.version}._`);
  return parts.join('\n\n');
}
