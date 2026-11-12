/**
 * Простой компьютер в бою: выбирает команду для отряда, чей сейчас ход.
 * Спецификация: docs/mechanics/15-battle-ai.md.
 */
import { attackOf, computeDamage, defenseOf, halvingsOf } from "./damage.ts";
import { cellIndex, distance } from "./hex.ts";
import type { Cell } from "./hex.ts";
import {
  activeStackOf,
  attackCells,
  canShoot,
  isAlive,
  reachableCells,
  walkSteps,
} from "./queries.ts";
import type { BattleCommand, BattleState, StackState, StrikeKind } from "./types.ts";

/**
 * Удвоенный ожидаемый урон: вместо бросков — средний урон существа, удача не учитывается.
 * Не больше удвоенного общего здоровья цели.
 */
function expectedDamage(
  state: BattleState,
  attacker: StackState,
  target: StackState,
  kind: StrikeKind,
): number {
  const { damageMin, damageMax } = attacker.creature;
  const damage = computeDamage(
    (damageMin + damageMax) * attacker.count,
    attackOf(state.sides, attacker),
    defenseOf(state.sides, target),
    false,
    halvingsOf(kind, attacker, target),
  );
  const health = (target.count - 1) * target.creature.health + target.firstHealth;
  return Math.min(damage, 2 * health);
}

/** Раньше по порядку та клетка, у которой меньше ряд, затем меньше столбец. */
function cellBefore(a: Cell, b: Cell): boolean {
  return a.row !== b.row ? a.row < b.row : a.col < b.col;
}

/** Клетка с наименьшей оценкой; при равенстве — первая по порядку клеток. */
function bestCell(cells: Iterable<Cell>, scoreOf: (cell: Cell) => number | undefined) {
  let best: { readonly cell: Cell; readonly score: number } | undefined;
  for (const cell of cells) {
    const score = scoreOf(cell);
    if (score === undefined) {
      continue;
    }
    if (
      best === undefined ||
      score < best.score ||
      (score === best.score && cellBefore(cell, best.cell))
    ) {
      best = { cell, score };
    }
  }
  return best;
}

function chooseShot(
  state: BattleState,
  me: StackState,
  enemies: readonly StackState[],
): BattleCommand | undefined {
  if (!canShoot(state, me)) {
    return undefined;
  }
  let best: StackState | undefined;
  let bestDamage = -1;
  for (const enemy of enemies) {
    const damage = expectedDamage(state, me, enemy, "shot");
    if (damage > bestDamage) {
      best = enemy;
      bestDamage = damage;
    }
  }
  return best === undefined ? undefined : { type: "battleShoot", side: me.side, target: best.id };
}

function chooseAttack(
  state: BattleState,
  me: StackState,
  enemies: readonly StackState[],
): BattleCommand | undefined {
  let best: { readonly enemy: StackState; readonly cells: readonly Cell[] } | undefined;
  let bestDamage = -1;
  for (const enemy of enemies) {
    const cells = attackCells(state, me, enemy);
    const damage = expectedDamage(state, me, enemy, "melee");
    if (cells.length > 0 && damage > bestDamage) {
      best = { enemy, cells };
      bestDamage = damage;
    }
  }
  if (best === undefined) {
    return undefined;
  }
  // Из клеток удара — ближайшая к отряду: пешему по шагам, летающему по расстоянию.
  const steps = me.creature.flying ? undefined : walkSteps(state, me, me);
  const from = bestCell(best.cells, (cell) =>
    steps === undefined ? distance(me, cell) : steps.get(cellIndex(cell)),
  );
  return from === undefined
    ? undefined
    : { type: "battleAttack", side: me.side, target: best.enemy.id, from: from.cell };
}

/** Как далеко от каждой клетки до врага: число для клетки или `undefined`, если пути нет. */
type Measure = (cell: Cell) => number | undefined;

/** Ближайший враг и мера «как далеко до него». */
function nearestEnemy(
  state: BattleState,
  me: StackState,
  enemies: readonly StackState[],
): Measure | undefined {
  let best: { readonly measure: Measure; readonly far: number } | undefined;
  if (!me.creature.flying) {
    for (const enemy of enemies) {
      const steps = walkSteps(state, enemy, me);
      const far = steps.get(cellIndex(me));
      if (far !== undefined && (best === undefined || far < best.far)) {
        best = { measure: (cell) => steps.get(cellIndex(cell)), far };
      }
    }
  }
  if (best === undefined) {
    // Летающий отряд, или пешком ни до кого не дойти: по расстоянию.
    for (const enemy of enemies) {
      const far = distance(me, enemy);
      if (best === undefined || far < best.far) {
        best = { measure: (cell) => distance(cell, enemy), far };
      }
    }
  }
  return best?.measure;
}

function chooseApproach(
  state: BattleState,
  me: StackState,
  enemies: readonly StackState[],
): BattleCommand | undefined {
  const measure = nearestEnemy(state, me, enemies);
  const now = measure?.(me);
  if (measure === undefined || now === undefined) {
    return undefined;
  }
  const best = bestCell(reachableCells(state, me).values(), measure);
  return best === undefined || best.score >= now
    ? undefined
    : { type: "battleMove", side: me.side, to: best.cell };
}

/**
 * Команда простого компьютера: стрелять → ударить → подойти → защищаться.
 * Случайных чисел не использует. `undefined` — бой окончен, ходить некому.
 */
export function chooseBattleCommand(state: BattleState): BattleCommand | undefined {
  const me = activeStackOf(state);
  if (state.result !== null || me === undefined) {
    return undefined;
  }
  const enemies = state.stacks.filter((stack) => stack.side !== me.side && isAlive(stack));
  return (
    chooseShot(state, me, enemies) ??
    chooseAttack(state, me, enemies) ??
    chooseApproach(state, me, enemies) ?? { type: "battleDefend", side: me.side }
  );
}
