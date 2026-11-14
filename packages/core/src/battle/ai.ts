/**
 * Простой компьютер в бою: выбирает команду для отряда, чей сейчас ход.
 * Спецификация: docs/mechanics/15-battle-ai.md; осада — 50-siege.md.
 */
import { bestCell, chooseApproach, chooseAttack, chooseShot, nearestEnemy } from "./aiMoves.ts";
import type { Allowed } from "./aiMoves.ts";
import { distance, sameCell } from "./hex.ts";
import { activeStackOf, isAlive, reachableCells } from "./queries.ts";
import { GATE_BRIDGE, GATE_INNER, isInside, isMachine, isMoat, TOWERS } from "./siege.ts";
import type { BattleCommand, BattleState, StackState } from "./types.ts";

/** За стеной и не на створе ворот: стоя там, обороняющийся ворот не открывает. */
const behindWall: Allowed = (cell) => isInside(cell) && !sameCell(cell, GATE_INNER);

/**
 * Как компьютер ведёт осаду. В игре — `SIEGE_TACTICS`; остальные значения нужны для сравнения
 * в прогонах (docs/mechanics/stage-6.md, «Сравнение тактик»).
 */
export interface SiegeTactics {
  /**
   * Когда обороняющийся выходит из-за стены: никогда; когда у него нет ни башен, ни стрелков;
   * ещё и когда его обстреливают, а ответить стрелками нечем; всегда.
   */
  readonly sortie: "never" | "noRanged" | "outshot" | "always";
  /** Обороняющийся, держа стену, подходит к врагу по клеткам внутри стен. */
  readonly closeUp: boolean;
  /** Летающие нападающего не летят за стену, пока пешим туда нет дороги. */
  readonly flyersWait: boolean;
}

export const SIEGE_TACTICS: SiegeTactics = {
  sortie: "noRanged",
  closeUp: false,
  flyersWait: false,
};

function hasShots(state: BattleState, side: number): boolean {
  return state.stacks.some(
    (stack) => stack.side === side && isAlive(stack) && !isMachine(stack) && stack.shots > 0,
  );
}

/** Обороняющийся держит стену — см. `SiegeTactics.sortie`. */
function holdsWall(state: BattleState, sortie: SiegeTactics["sortie"]): boolean {
  const { siege } = state;
  if (siege === null || sortie === "always") {
    return false;
  }
  if (sortie === "never") {
    return true;
  }
  const ranged = hasShots(state, 1);
  if (sortie === "outshot" && !ranged && hasShots(state, 0)) {
    return false;
  }
  return ranged || TOWERS.some((tower) => siege.health[tower] > 0);
}

/** Летающему нападающему рано за стену: у него есть пешие, дороги им нет, катапульта ещё стреляет. */
function flyerWaits(state: BattleState, me: StackState, enemies: readonly StackState[]): boolean {
  const mine = state.stacks.filter((stack) => stack.side === 0 && isAlive(stack));
  const foot = mine.filter((stack) => !isMachine(stack) && !stack.creature.flying);
  return (
    me.creature.flying &&
    foot.length > 0 &&
    mine.some((stack) => isMachine(stack) && stack.shots > 0) &&
    !foot.some((stack) => nearestEnemy(state, stack, enemies, true) !== undefined)
  );
}

/**
 * Осада встала: катапульта разбита или отстрелялась, а у нападающего нет ни летающих,
 * ни стрелков с выстрелами, ни пешей дороги к врагу. Тогда его герой бежит.
 */
function siegeStalled(state: BattleState, enemies: readonly StackState[]): boolean {
  const mine = state.stacks.filter((stack) => stack.side === 0 && isAlive(stack));
  const able = (stack: StackState): boolean =>
    isMachine(stack)
      ? stack.shots > 0
      : stack.creature.flying ||
        stack.shots > 0 ||
        nearestEnemy(state, stack, enemies, true) !== undefined;
  return state.sides[0].hero !== null && !mine.some(able);
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
 * Катапульту бьют, только когда больше некого. Нападающий бежит, когда осада встала.
 * Случайных чисел не использует.
 * `undefined` — бой окончен, ходить некому.
 */
export function chooseBattleCommand(
  state: BattleState,
  tactics: SiegeTactics = SIEGE_TACTICS,
): BattleCommand | undefined {
  const me = activeStackOf(state);
  if (state.result !== null || me === undefined) {
    return undefined;
  }
  const foes = state.stacks.filter((stack) => stack.side !== me.side && isAlive(stack));
  const enemies = foes.filter((stack) => !isMachine(stack));
  // Катапульта — цель последней очереди: по ней бьют, когда больше ударить некого.
  const machines = foes.filter((stack) => isMachine(stack));
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
  if (me.side === 1 && holdsWall(state, tactics.sortie) && isInside(me)) {
    // Бьёт только тех, до кого дотягивается, не выходя за стену и не открывая ворот.
    return (
      chooseAttack(state, me, enemies, behindWall) ??
      (tactics.closeUp ? chooseApproach(state, me, enemies, behindWall, false) : undefined) ??
      defend
    );
  }
  if (me.side === 0 && siegeStalled(state, enemies)) {
    return { type: "battleFlee", side: 0 };
  }
  if (me.side === 0 && tactics.flyersWait && flyerWaits(state, me, enemies)) {
    return chooseAttack(state, me, enemies, (cell) => !isInside(cell)) ?? defend;
  }
  // Пешему нападающему ров по дороге в пролом не помеха; остальные в ров не встают.
  const onFoot = me.side === 0 && !me.creature.flying;
  const dry: Allowed = (cell) => onFoot || !isMoat(state.siege, cell);
  return (
    chooseAttack(state, me, enemies, dry) ??
    chooseAttack(state, me, machines, dry) ??
    chooseApproach(state, me, enemies, dry, onFoot) ??
    (onFoot ? leaveBridge(state, me) : undefined) ??
    defend
  );
}
