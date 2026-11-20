const MAX_PLAYERS = 500;

export function normalizePlayerName(value) {
  return typeof value === 'string'
    ? Array.from(value).filter(character => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && (code < 127 || code > 159);
    }).join('').replace(/\s+/g, ' ').trim().slice(0, 39)
    : '';
}

function normalizeScore(value) {
  if (!value || typeof value !== 'object') return undefined;
  const name = normalizePlayerName(value.name);
  if (!name || !Number.isSafeInteger(value.points) || value.points < 0 || !Number.isSafeInteger(value.level) || value.level < 1) return undefined;
  return { name, points: value.points, level: value.level };
}

function compareScores(a, b) {
  return b.points - a.points || b.level - a.level || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
}

export function parseLocalRanking(raw) {
  if (typeof raw !== 'string' || !raw) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  const bestByPlayer = new Map();
  for (const value of parsed) {
    const score = normalizeScore(value);
    if (!score) continue;
    const key = score.name.toLocaleLowerCase('pt-BR');
    const previous = bestByPlayer.get(key);
    if (!previous || compareScores(score, previous) < 0) bestByPlayer.set(key, score);
  }
  return [...bestByPlayer.values()].sort(compareScores).slice(0, MAX_PLAYERS);
}

export function recordLocalScore(raw, value) {
  const scores = parseLocalRanking(raw);
  const candidate = normalizeScore(value);
  if (!candidate) return { scores, updated: false, rank: undefined, serialized: JSON.stringify(scores) };

  const key = candidate.name.toLocaleLowerCase('pt-BR');
  const index = scores.findIndex(score => score.name.toLocaleLowerCase('pt-BR') === key);
  const previous = index < 0 ? undefined : scores[index];
  const updated = !previous || candidate.points > previous.points || (candidate.points === previous.points && candidate.level > previous.level);
  if (updated) {
    if (index >= 0) scores.splice(index, 1);
    scores.push(candidate);
  }

  const sorted = scores.sort(compareScores).slice(0, MAX_PLAYERS);
  const rankIndex = sorted.findIndex(score => score.name.toLocaleLowerCase('pt-BR') === key);
  return { scores: sorted, updated, rank: rankIndex < 0 ? undefined : rankIndex + 1, serialized: JSON.stringify(sorted) };
}
