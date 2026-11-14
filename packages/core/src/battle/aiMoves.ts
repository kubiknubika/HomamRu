/**
 * Ходы простого компьютера боя: выстрел, удар, подход. Спецификация: docs/mechanics/15-battle-ai.md.
 */
import { attackOf, computeDamage, defenseOf, halvingsOf } from "./damage.ts";
import { cellIndex, distance } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { attackCells, canShoot, reachableCells, walkSteps } from "./queries.ts";
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
    attackOf(state, attacker),
    defenseOf(state, target),
    false,
    halvingsOf(state, kind, attacker, target),
  );
  const health = (target.count - 1) * target.creature.health + target.firstHealth;
  return Math.min(damage, 2 * health);
}

/** Раньше по порядку та клетка, у которой меньше ряд, затем меньше столбец. */
function cellBefore(a: Cell, b: Cell): boolean {
  return a.row !== b.row ? a.row < b.row : a.col < b.col;
}

/** Клетка с наименьшей оценкой; при равенстве — первая по порядку клеток. */
export function bestCell(cells: Iterable<Cell>, scoreOf: (cell: Cell) => number | undefined) {
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

export function chooseShot(
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

/** Куда отряду можно вставать: в осаде компьютер ходит не везде (50-siege.md). */
export type Allowed = (cell: Cell) => boolean;

export function chooseAttack(
  state: BattleState,
  me: StackState,
  enemies: readonly StackState[],
  allowed: Allowed,
): BattleCommand | undefined {
  let best: { readonly enemy: StackState; readonly cells: readonly Cell[] } | undefined;
  let bestDamage = -1;
  for (const enemy of enemies) {
    const cells = attackCells(state, me, enemy).filter(allowed);
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

/** Ближайший враг и мера «как далеко до него». `onFootOnly` — только если до врага есть дорога. */
export function nearestEnemy(
  state: BattleState,
  me: StackState,
  enemies: readonly StackState[],
  onFootOnly: boolean,
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
  if (best === undefined && !onFootOnly) {
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

export function chooseApproach(
  state: BattleState,
  me: StackState,
  enemies: readonly StackState[],
  allowed: Allowed,
  onFootOnly: boolean,
): BattleCommand | undefined {
  const measure = nearestEnemy(state, me, enemies, onFootOnly);
  const now = measure?.(me);
  if (measure === undefined || now === undefined) {
    return undefined;
  }
  const best = bestCell([...reachableCells(state, me).values()].filter(allowed), measure);
  return best === undefined || best.score >= now
    ? undefined
    : { type: "battleMove", side: me.side, to: best.cell };
}
