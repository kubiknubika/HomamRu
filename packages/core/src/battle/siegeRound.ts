/**
 * Начало раунда в осаде: стреляют башни, затем катапульта.
 * Спецификация: docs/mechanics/50-siege.md.
 */
import { applyDamage } from "./damage.ts";
import { rollInt } from "./draft.ts";
import type { BattleDraft } from "./draft.ts";
import { attackCells, canShoot } from "./queries.ts";
import { isInside, isMachine, SEGMENTS, TOWERS } from "./siege.ts";
import type { SiegeState, Tower, WallPart } from "./siege.ts";
import type { StackState } from "./types.ts";

/** Шанс катапульты попасть, в процентах. */
const HIT_CHANCE: Readonly<Record<WallPart, number>> = {
  wall1: 50,
  wall2: 50,
  wall3: 50,
  wall4: 50,
  gate: 25,
  keep: 5,
  upperTower: 10,
  lowerTower: 10,
};
/** Урон катапульты по прочности: меньше 10 из 100 — 0, меньше 70 — 1, иначе 2. */
const NO_DAMAGE_BELOW = 10;
const ONE_DAMAGE_BELOW = 70;

/** Место части вдоль стены сверху вниз: по нему ищется «ближайшая». */
const POSITION: Readonly<Record<WallPart, number>> = {
  upperTower: 0,
  wall1: 1,
  wall2: 2,
  gate: 3,
  wall3: 4,
  wall4: 5,
  keep: 6,
  lowerTower: 6,
};

/** Случайный из списка; жребий бросается, только если есть из чего выбирать. */
function pickRandom<T>(draft: BattleDraft, list: readonly T[]): T | undefined {
  return list.length > 1 ? list[rollInt(draft, 0, list.length - 1)] : list[0];
}

/** Из списка — с наименьшей оценкой; из равных — случайный. */
function pickLowest<T>(
  draft: BattleDraft,
  list: readonly T[],
  valueOf: (entry: T) => number,
): T | undefined {
  const lowest = Math.min(...list.map(valueOf));
  return pickRandom(
    draft,
    list.filter((entry) => valueOf(entry) === lowest),
  );
}

function standing(siege: SiegeState, parts: readonly WallPart[]): WallPart[] {
  return parts.filter((part) => siege.health[part] > 0);
}

/** Куда целится катапульта: слабейший участок стены, потом ворота, главная башня, малые башни. */
function catapultTarget(draft: BattleDraft, siege: SiegeState): WallPart | undefined {
  const walls = standing(siege, SEGMENTS);
  if (walls.length > 0) {
    return pickLowest(draft, walls, (part) => siege.health[part]);
  }
  const [next] = standing(siege, ["gate", "keep"]);
  return next ?? pickRandom(draft, standing(siege, ["upperTower", "lowerTower"]));
}

function shootCatapult(draft: BattleDraft, siege: SiegeState, catapult: { shots: number }): void {
  const aimed = catapultTarget(draft, siege);
  if (aimed === undefined) {
    return;
  }
  catapult.shots -= 1;
  let hit = aimed;
  if (rollInt(draft, 0, 99) >= HIT_CHANCE[aimed]) {
    // Промах уходит в ближайший другой целый участок стены; если таких нет — всё-таки в цель.
    const others = standing(siege, SEGMENTS).filter((part) => part !== aimed);
    hit = pickLowest(draft, others, (part) => Math.abs(POSITION[part] - POSITION[aimed])) ?? aimed;
  }
  const roll = rollInt(draft, 0, 99);
  const damage = roll < NO_DAMAGE_BELOW ? 0 : roll < ONE_DAMAGE_BELOW ? 1 : 2;
  const left = Math.max(0, siege.health[hit] - damage);
  draft.siege = { ...siege, health: { ...siege.health, [hit]: left } };
  draft.events.push({ type: "catapultShot", aimed, hit, damage, left });
}

function totalHealth(stack: StackState): number {
  return (stack.count - 1) * stack.creature.health + stack.firstHealth;
}

/** Насколько ценен выстрел башни по отряду: цена найма выбитого здоровья и убитых, по среднему урону. */
function shotValue(stack: StackState, minDamage: number): number {
  const { price, health } = stack.creature;
  const killedBy = (damage: number): number =>
    applyDamage(stack.count, stack.firstHealth, health, damage).killed;
  const average = (minDamage + 2 * minDamage) / 2;
  const kills = (killedBy(minDamage) + killedBy(2 * minDamage)) / 2;
  return (Math.min(totalHealth(stack), average) * price) / health + kills * price;
}

/**
 * Цель башни: сначала тот, кто на следующем ходу сможет выстрелить или ударить;
 * из равных — тот, кто внутри стен; из равных — тот, по кому выстрел ценнее; затем по месту в армии.
 */
function towerTarget(draft: BattleDraft, minDamage: number): StackState | undefined {
  const defenders = draft.stacks.filter((stack) => stack.side === 1 && stack.count > 0);
  const keyOf = (stack: StackState): readonly number[] => [
    canShoot(draft, stack) ||
    defenders.some((defender) => attackCells(draft, stack, defender).length > 0)
      ? 1
      : 0,
    isInside(stack) ? 1 : 0,
    shotValue(stack, minDamage),
    -stack.slot,
  ];
  let best: { readonly stack: StackState; readonly key: readonly number[] } | undefined;
  for (const stack of draft.stacks) {
    if (stack.side !== 0 || stack.count === 0 || isMachine(stack)) {
      continue;
    }
    const key = keyOf(stack);
    const differs = best?.key.findIndex((value, index) => value !== key[index]) ?? -1;
    if (best === undefined || (differs >= 0 && (key[differs] ?? 0) > (best.key[differs] ?? 0))) {
      best = { stack, key };
    }
  }
  return best?.stack;
}

function shootTower(draft: BattleDraft, tower: Tower, minDamage: number): void {
  const target = draft.stacks.find((stack) => stack.id === towerTarget(draft, minDamage)?.id);
  if (target === undefined) {
    return;
  }
  // Атака башни 0, защита цели не считается: урон как выпал.
  const damage = rollInt(draft, minDamage, 2 * minDamage);
  const losses = applyDamage(target.count, target.firstHealth, target.creature.health, damage);
  target.count = losses.count;
  target.firstHealth = losses.firstHealth;
  draft.events.push({
    type: "towerShot",
    tower,
    targetId: target.id,
    damage,
    killed: losses.killed,
    left: losses.count,
  });
  if (losses.count === 0) {
    target.turn = "done";
    draft.events.push({ type: "stackDied", stackId: target.id });
  }
}

/** Башни по порядку, потом катапульта. Вне осады ничего не делает. */
export function siegePhase(draft: BattleDraft): void {
  if (draft.siege === null) {
    return;
  }
  for (const tower of TOWERS) {
    if (draft.siege.health[tower] > 0) {
      const { keepDamage, towerDamage } = draft.siege;
      shootTower(draft, tower, tower === "keep" ? keepDamage : towerDamage);
    }
  }
  const catapult = draft.stacks.find((stack) => isMachine(stack) && stack.count > 0);
  const attackers = draft.stacks.some(
    (stack) => stack.side === 0 && stack.count > 0 && !isMachine(stack),
  );
  if (catapult !== undefined && catapult.shots > 0 && attackers) {
    shootCatapult(draft, draft.siege, catapult);
  }
}
