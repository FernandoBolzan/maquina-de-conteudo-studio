/**
 * Benchmark das Damas Brasileiras com os orçamentos ENTREGUES (DAMAS_LEVELS). Uso: `npx tsx scripts/damas-benchmark.ts`.
 *
 * 1. Custo: >= 200 posições (aberturas, meio de jogo e finais de partidas semeadas). Registra nós/s, máximo de nós por lance
 *    (critério: <= 4x o orçamento) e máximo de tempo de uma fatia `step(1)`, isto é, de um par raiz x resposta (critério: <= 60 ms).
 * 2. Força: 6 partidas por confronto, sementes 1..6, cores alternadas, abertura sorteada por semente, teto de 120 jogadas.
 *    Limiares: Mestre x Iniciante >= 5,0 de 6; Avançado x Intermediário >= 3,5 de 6.
 */
import { applyMove, generateMoves, initialPosition, type Position } from '../src/shared/damas.js';
import { DAMAS_LEVELS, createSearch, seededRandom } from '../src/shared/damas-ai.js';
import { playSeries } from '../src/shared/damas-match.js';
import type { LevelId } from '../src/shared/damas.js';

function samplePositions(): Position[] {
  const positions: Position[] = [];
  for (let seed = 1; seed <= 30; seed++) {
    const random = seededRandom(seed * 31);
    let position = initialPosition();
    for (let ply = 0; ply < 90; ply++) {
      const moves = generateMoves(position);
      if (moves.length === 0) break;
      if (ply % 6 === 0) positions.push(position);
      position = applyMove(position, moves[Math.floor(random() * moves.length)]!);
    }
  }
  return positions;
}

let failed = false;
const positions = samplePositions();
console.log(`Posições de custo: ${positions.length}`);
for (const level of ['intermediario', 'avancado', 'mestre'] as const) {
  const config = DAMAS_LEVELS[level];
  let totalNodes = 0, totalMs = 0, maxNodes = 0, maxMoveMs = 0, maxSliceMs = 0;
  for (const position of positions) {
    const search = createSearch(position, level, seededRandom(1));
    const started = performance.now();
    let moveNodes = 0;
    while (!search.done) {
      const before = search.nodes;
      const sliceStart = performance.now();
      search.step(1);
      maxSliceMs = Math.max(maxSliceMs, performance.now() - sliceStart);
      moveNodes += search.nodes - before;
    }
    const ms = performance.now() - started;
    totalNodes += moveNodes; totalMs += ms; maxNodes = Math.max(maxNodes, moveNodes); maxMoveMs = Math.max(maxMoveMs, ms);
  }
  const nodesOk = maxNodes <= 4 * config.budget;
  const sliceOk = maxSliceMs <= 60;
  if (!nodesOk || !sliceOk) failed = true;
  console.log(`${level.padEnd(13)} orçamento ${String(config.budget).padStart(6)} | nós/s ${Math.round(totalNodes / (totalMs / 1000))} | média ${Math.round(totalMs / positions.length)} ms | máx lance ${Math.round(maxMoveMs)} ms | máx nós ${maxNodes} (${nodesOk ? 'ok' : 'ACIMA de 4x'}) | máx fatia ${maxSliceMs.toFixed(1)} ms (${sliceOk ? 'ok' : 'ACIMA de 60 ms'})`);
}

const series: [LevelId, LevelId, number][] = process.env.ONLY_COST === '1' ? [] : [['mestre', 'iniciante', 5.0], ['avancado', 'intermediario', 3.5], ['intermediario', 'iniciante', 4.0]];
for (const [strong, weak, threshold] of series) {
  const started = performance.now();
  const score = playSeries(strong, weak, 6, 1);
  const pass = score.points >= threshold && score.openings === 6;
  if (!pass) failed = true;
  console.log(`${strong} x ${weak}: ${score.points} de ${score.games} (limiar ${threshold}; aberturas distintas ${score.openings}/6) ${pass ? 'ok' : 'FALHOU'} em ${Math.round((performance.now() - started) / 1000)} s | ${score.outcomes.map(o => `${o.winner}:${o.plies}`).join(' ')}`);
}
console.log(failed ? 'RESULTADO: FALHOU' : 'RESULTADO: OK');
process.exit(failed ? 1 : 0);
