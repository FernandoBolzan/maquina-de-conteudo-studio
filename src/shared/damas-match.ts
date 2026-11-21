import { BLACK, WHITE, applyMove, currentPosition, gameFrom, gameStatus, generateMoves, initialPosition, playMove, positionHash, type Game, type LevelId, type Position, type Side } from './damas.js';
import { searchMove, seededRandom } from './damas-ai.js';

/** Posição de abertura: `plies` jogadas legais sorteadas por uma semente (usada para variar as partidas de teste). */
export function randomOpening(seed: number, plies = 4): Position {
  const random = seededRandom(seed * 7919 + 13);
  let position = initialPosition();
  for (let i = 0; i < plies; i++) {
    const moves = generateMoves(position);
    if (moves.length === 0) break;
    position = applyMove(position, moves[Math.floor(random() * moves.length)]!);
  }
  return position;
}

export type MatchOutcome = { winner: Side | 0; plies: number; reason: string };

/** Joga uma partida completa entre dois níveis, com teto de jogadas (o teto vale como empate). */
export function playMatch(white: LevelId, black: LevelId, opening: Position, seed: number, budgetScale: number, maxPlies = 120): MatchOutcome {
  const random = seededRandom(seed);
  let game: Game = gameFrom(opening);
  for (let ply = 0; ply < maxPlies; ply++) {
    const status = gameStatus(game);
    if (status.state === 'won') return { winner: status.winner, plies: ply, reason: status.reason };
    if (status.state === 'draw') return { winner: 0, plies: ply, reason: status.reason };
    const position = currentPosition(game);
    const result = searchMove(position, position.turn === WHITE ? white : black, random, { budgetScale });
    if (!result.move) return { winner: position.turn === WHITE ? BLACK : WHITE, plies: ply, reason: 'sem lances' };
    game = playMove(game, result.move);
  }
  return { winner: 0, plies: maxPlies, reason: 'limite de jogadas' };
}

export interface MatchScore { points: number; games: number; openings: number; outcomes: MatchOutcome[] }

/**
 * Confronto de `games` partidas (sementes 1..games), cores alternadas, abertura sorteada por semente e igual para os dois lados.
 * Pontos do `strong`: vitória 1, empate ou limite 0,5.
 */
export function playSeries(strong: LevelId, weak: LevelId, games: number, budgetScale: number, maxPlies = 120): MatchScore {
  let points = 0;
  const openings = new Set<number>();
  const outcomes: MatchOutcome[] = [];
  for (let seed = 1; seed <= games; seed++) {
    const opening = randomOpening(seed);
    openings.add(positionHash(opening));
    const strongIsWhite = seed % 2 === 1;
    const outcome = strongIsWhite ? playMatch(strong, weak, opening, seed, budgetScale, maxPlies) : playMatch(weak, strong, opening, seed, budgetScale, maxPlies);
    outcomes.push(outcome);
    const strongSide: Side = strongIsWhite ? WHITE : BLACK;
    points += outcome.winner === 0 ? 0.5 : outcome.winner === strongSide ? 1 : 0;
  }
  return { points, games, openings: openings.size, outcomes };
}
