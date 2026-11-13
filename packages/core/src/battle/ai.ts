/**
 * Простой компьютер в бою: выбирает команду для отряда, чей сейчас ход.
 * Спецификация: docs/mechanics/15-battle-ai.md.
 */
import { attackOf, computeDamage, defenseOf, halvingsOf } from "./damage.ts";
import { cellIndex, distance, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import {
  activeStackOf,
  attackCells,
  canShoot,
  isAlive,
  reachableCells,
  walkSteps,
} from "./queries.ts";
import { GATE_BRIDGE, GATE_INNER, isInside, isMachine, isMoat, TOWERS } from "./siege.ts";
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

/** Куда отряду можно вставать: в осаде компьютер ходит не везде (50-siege.md). */
type Allowed = (cell: Cell) => boolean;

function chooseAttack(
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
function nearestEnemy(
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

function chooseApproach(
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

/** За стеной и не на створе ворот: стоя там, обороняющийся ворот не открывает. */
const behindWall: Allowed = (cell) => isInside(cell) && !sameCell(cell, GATE_INNER);

/** Обороняющийся держит стену, пока ему есть чем стрелять: башнями или стрелками. */
function holdsWall(state: BattleState): boolean {
  const { siege } = state;
  return (
    siege !== null &&
    (TOWERS.some((tower) => siege.health[tower] > 0) ||
      state.stacks.some((stack) => stack.side === 1 && isAlive(stack) && stack.shots > 0))
  );
}

/** Нападающий сошёл с моста: стоя на нём, он не даёт обороняющемуся открыть ворота и выйти. */
function leaveBridge(state: BattleState, me: StackState): BattleCommand | undefined {
  if (!sameCell(me, GATE_BRIDGE)) {
    return undefined;
  }
  const to = bestCell(reachableCells(state, me).values(), (cell) =>
    isMoat(state.siege, cell) ? undefined : distance(cell, GATE_BRIDGE),
  );
  return to === undefined ? undefined : { type: "battleMove", side: me.side, to: to.cell };
}

/**
 * Команда простого компьютера: стрелять → ударить → подойти → защищаться.
 * В осаде (50-siege.md): обороняющийся, пока ему есть чем стрелять, за стену не выходит;
 * пеший нападающий идёт, только когда до врага есть дорога; в ров зря никто не встаёт.
 * Катапульту компьютер не трогает. Случайных чисел не использует.
 * `undefined` — бой окончен, ходить некому.
 */
export function chooseBattleCommand(state: BattleState): BattleCommand | undefined {
  const me = activeStackOf(state);
  if (state.result !== null || me === undefined) {
    return undefined;
  }
  const enemies = state.stacks.filter(
    (stack) => stack.side !== me.side && isAlive(stack) && !isMachine(stack),
  );
  const defend: BattleCommand = { type: "battleDefend", side: me.side };
  const shot = chooseShot(state, me, enemies);
  if (state.siege === null || shot !== undefined) {
    return (
      shot ??
      chooseAttack(state, me, enemies, () => true) ??
      chooseApproach(state, me, enemies, () => true, false) ??
      defend
    );
  }
  if (me.side === 1 && holdsWall(state) && isInside(me)) {
    // Бьёт только тех, до кого дотягивается, не выходя за стену и не открывая ворот.
    return chooseAttack(state, me, enemies, behindWall) ?? defend;
  }
  // Пешему нападающему ров по дороге в пролом не помеха; остальные в ров не встают.
  const onFoot = me.side === 0 && !me.creature.flying;
  const dry: Allowed = (cell) => onFoot || !isMoat(state.siege, cell);
  return (
    chooseAttack(state, me, enemies, dry) ??
    chooseApproach(state, me, enemies, dry, onFoot) ??
    (onFoot ? leaveBridge(state, me) : undefined) ??
    defend
  );
}
