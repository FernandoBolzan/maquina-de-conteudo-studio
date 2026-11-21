import { LEVEL_IDS, isLevelId, restoreGame, serializeGame, type Game, type LevelId, type Side } from './damas.js';

export const DAMAS_STORAGE_KEY = 'maquina-studio.damas.v1';
export const DAMAS_PREFERENCES_KEY = 'maquina-studio.damas.preferences.v1';

export interface DamasStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DamasPreferences { level: LevelId; color: Side }
export const DEFAULT_DAMAS_PREFERENCES: DamasPreferences = { level: 'intermediario', color: 1 };

/** Partida em andamento salva: repetida pelo motor ao ler; formato inválido, versão errada ou lance ilegal descarta. */
export function loadSavedGame(storage: DamasStorage | undefined): { game: Game; color: Side; level: LevelId } | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(DAMAS_STORAGE_KEY);
    return raw === null ? undefined : restoreGame(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function saveGame(storage: DamasStorage | undefined, game: Game, color: Side, level: LevelId): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DAMAS_STORAGE_KEY, JSON.stringify(serializeGame(game, color, level)));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedGame(storage: DamasStorage | undefined): void {
  try { storage?.removeItem(DAMAS_STORAGE_KEY); } catch { /* sem armazenamento: nada a limpar */ }
}

export function loadPreferences(storage: DamasStorage | undefined): DamasPreferences {
  if (!storage) return DEFAULT_DAMAS_PREFERENCES;
  try {
    const raw = storage.getItem(DAMAS_PREFERENCES_KEY);
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return DEFAULT_DAMAS_PREFERENCES;
    const level = 'level' in value && isLevelId(value.level) ? value.level : DEFAULT_DAMAS_PREFERENCES.level;
    const color: Side = 'color' in value && value.color === -1 ? -1 : 1;
    return { level, color };
  } catch {
    return DEFAULT_DAMAS_PREFERENCES;
  }
}

export function savePreferences(storage: DamasStorage | undefined, preferences: DamasPreferences): boolean {
  if (!storage || !LEVEL_IDS.includes(preferences.level)) return false;
  try {
    storage.setItem(DAMAS_PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
