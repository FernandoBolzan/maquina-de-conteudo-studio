import { randomBytes, timingSafeEqual } from 'node:crypto';

// 32-character unambiguous alphabet (omits 0, O, 1, I to prevent human confusion)
const PIN_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PIN_LENGTH = 6;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function generatePin(): string {
  const bytes = randomBytes(PIN_LENGTH);
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += PIN_ALPHABET[bytes[i]! % PIN_ALPHABET.length];
  }
  return pin;
}

export function normalizePin(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function comparePinTimingSafe(a: string, b: string): boolean {
  const normA = normalizePin(a);
  const normB = normalizePin(b);
  if (normA.length !== PIN_LENGTH || normB.length !== PIN_LENGTH) return false;
  const bufA = Buffer.from(normA, 'utf8');
  const bufB = Buffer.from(normB, 'utf8');
  return timingSafeEqual(bufA, bufB);
}

interface AttemptTracker {
  count: number;
  resetAt: number;
}

interface Session {
  token: string;
  createdAt: number;
  expiresAt: number;
  ip: string;
}

export class MobileAuthManager {
  private activePin: string;
  private attempts = new Map<string, AttemptTracker>();
  private sessions = new Map<string, Session>();

  constructor(initialPin?: string) {
    this.activePin = initialPin ? normalizePin(initialPin) : generatePin();
  }

  getPin(): string {
    return this.activePin;
  }

  regeneratePin(): string {
    this.activePin = generatePin();
    this.attempts.clear();
    return this.activePin;
  }

  setPin(pin: string): void {
    const norm = normalizePin(pin);
    if (norm.length !== PIN_LENGTH) throw new Error(`O token deve conter exatamente ${PIN_LENGTH} caracteres alfanuméricos.`);
    this.activePin = norm;
    this.attempts.clear();
  }

  verify(attempt: string, ip: string): { ok: true; sessionToken: string } | { ok: false; error: string; status: number } {
    const now = Date.now();
    const tracker = this.attempts.get(ip);

    if (tracker && now < tracker.resetAt && tracker.count >= MAX_ATTEMPTS_PER_WINDOW) {
      const waitSeconds = Math.ceil((tracker.resetAt - now) / 1000);
      return {
        ok: false,
        error: `Muitas tentativas incorretas. Aguarde ${waitSeconds} segundos para tentar novamente.`,
        status: 429,
      };
    }

    const valid = comparePinTimingSafe(attempt, this.activePin);
    if (!valid) {
      const current = (tracker && now < tracker.resetAt)
        ? { count: tracker.count + 1, resetAt: tracker.resetAt }
        : { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
      this.attempts.set(ip, current);

      const remaining = Math.max(0, MAX_ATTEMPTS_PER_WINDOW - current.count);
      return {
        ok: false,
        error: remaining > 0
          ? `Token de 6 dígitos incorreto. Você tem mais ${remaining} tentativa(s).`
          : 'Muitas tentativas incorretas. Aguarde 60 segundos.',
        status: remaining > 0 ? 401 : 429,
      };
    }

    // Success: clear rate limit tracker for this IP
    this.attempts.delete(ip);

    // Create session token
    const sessionToken = randomBytes(32).toString('hex');
    this.sessions.set(sessionToken, {
      token: sessionToken,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      ip,
    });

    this.cleanupExpiredSessions();
    return { ok: true, sessionToken };
  }

  validateSession(sessionToken?: string): boolean {
    if (!sessionToken || typeof sessionToken !== 'string') return false;
    const session = this.sessions.get(sessionToken);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionToken);
      return false;
    }
    return true;
  }

  revokeSession(sessionToken: string): void {
    this.sessions.delete(sessionToken);
  }

  getActiveSessionsCount(): number {
    this.cleanupExpiredSessions();
    return this.sessions.size;
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
      }
    }
  }
}
