/**
 * Простой компьютер боя колдует: перебирает заклинания и цели, берёт самое полезное.
 * Спецификация: docs/mechanics/63-opponent-magic.md.
 */
import type { SpellDefinition, SpellEffect } from "../spells.ts";
import { canTarget, castableSpells, spellValue } from "./cast.ts";
import { spellDamagePercent } from "./effects.ts";
import { hasAdjacentEnemy, isAlive } from "./queries.ts";
import { isMachine } from "./siege.ts";
import type { BattleCommand, BattleSide, BattleState, StackState } from "./types.ts";

/**
 * Польза считается в целых числах: одно очко здоровья — 80 единиц.
 * Так проценты (7,5 %, 15 %, 30 %) и средний урон не дают дробей.
 */
const HEALTH = 80;
/** Дальше стольких раундов компьютер не заглядывает. */
const MAX_ROUNDS = 3;
const PERCENT = 100;
/** Очко атаки — 5 % урона, очко защиты — 2,5 % (13-battle-damage.md). */
const ATTACK_POINT = 5;
const DEFENSE_POINT_X2 = 5;

type Effect = Pick<StackState["effects"][number], "effect" | "value" | "rounds">;

/** Средний урон удара отряда, в единицах пользы; поправки на атаку и защиту нет — цель неизвестна. */
function strikeOf(stack: StackState): number {
  const { damageMin, damageMax } = stack.creature;
  return ((damageMin + damageMax) * stack.count * HEALTH) / 2;
}

/** Разница между наибольшим (или наименьшим) и средним уроном отряда. */
function spreadOf(stack: StackState): number {
  const { damageMin, damageMax } = stack.creature;
  return ((damageMax - damageMin) * stack.count * HEALTH) / 2;
}

function isMelee(stack: StackState): boolean {
  return stack.shots === 0;
}

function roundsOf(rounds: number): number {
  return Math.min(Math.max(1, rounds), MAX_ROUNDS);
}

function strongest(stacks: readonly StackState[]): number {
  return Math.max(0, ...stacks.map(strikeOf));
}

interface Scene {
  readonly state: BattleState;
  /** Живые отряды, враждебные тому, на ком действие. */
  readonly foesOf: (stack: StackState) => StackState[];
}

/**
 * Чего стоит действие на отряде: для полезного — сколько оно даёт хозяину,
 * для вредного — сколько отнимает. Таблица — в 63-opponent-magic.md.
 */
function worthOf(scene: Scene, stack: StackState, effect: Effect): number {
  const rounds = roundsOf(effect.rounds);
  const kinds: Partial<Record<SpellEffect, () => number>> = {
    maxDamage: () => spreadOf(stack) * rounds,
    minDamage: () => spreadOf(stack) * rounds,
    meleeAttack: () =>
      isMelee(stack) ? (strikeOf(stack) * effect.value * ATTACK_POINT * rounds) / PERCENT : 0,
    defense: () =>
      (strongest(scene.foesOf(stack)) * effect.value * DEFENSE_POINT_X2 * rounds) / (2 * PERCENT),
    meleeDamagePercent: () =>
      (strongest(scene.foesOf(stack).filter(isMelee)) * (PERCENT - effect.value) * rounds) /
      PERCENT,
    speed: () => (approaching(scene.state, stack) ? strikeOf(stack) / 2 : 0),
    speedPercent: () => (approaching(scene.state, stack) ? strikeOf(stack) / 2 : 0),
    spellDamagePercent: () => 0,
  };
  return Math.floor(kinds[effect.effect]?.() ?? 0);
}

/** Отряд ближнего боя, ещё не дошедший до врага. */
function approaching(state: BattleState, stack: StackState): boolean {
  return isMelee(stack) && !hasAdjacentEnemy(state, stack);
}

/** Наибольший урон, который герой стороны может нанести заклинанием школы `school`. */
function spellThreat(state: BattleState, side: BattleSide, spell: SpellDefinition): number {
  const hero = state.sides[side].hero;
  if (hero === null || spell.protects === undefined) {
    return 0;
  }
  const { protects } = spell;
  const damages = hero.spells
    .filter(
      (item) =>
        item.effect === "damage" && item.cost <= hero.mana && item.schools.includes(protects),
    )
    .map((item) => spellValue(item, hero.spellPower));
  return Math.max(0, ...damages);
}

function healthOf(stack: StackState): number {
  return (stack.count - 1) * stack.creature.health + stack.firstHealth;
}

/** Польза заклинания на цели; 0 — колдовать незачем. */
function benefit(
  scene: Scene,
  side: BattleSide,
  spellPower: number,
  spell: SpellDefinition,
  target: StackState,
): number {
  const harmful = target.effects.filter((effect) => effect.negative);
  const sum = (effects: readonly Effect[]): number =>
    effects.reduce((total, effect) => total + worthOf(scene, target, effect), 0);
  switch (spell.effect) {
    case "damage": {
      const raw = spellValue(spell, spellPower);
      const damage = Math.floor((raw * spellDamagePercent(target, spell.schools)) / PERCENT);
      return Math.min(damage, healthOf(target)) * HEALTH;
    }
    case "heal": {
      const healed = Math.min(
        spellValue(spell, spellPower),
        target.creature.health - target.firstHealth,
      );
      return healed * HEALTH + sum(harmful);
    }
    case "dispel":
      // Только когда на отряде одно вредное: полезное снимать жалко.
      return harmful.length === target.effects.length ? sum(harmful) : 0;
    default: {
      if (target.effects.some((effect) => effect.spell === spell.id)) {
        return 0;
      }
      const countered = target.effects.filter((effect) => spell.counters.includes(effect.spell));
      const own =
        spell.effect === "spellDamagePercent"
          ? Math.floor(
              (spellThreat(scene.state, side === 0 ? 1 : 0, spell) *
                (PERCENT - spell.value) *
                HEALTH) /
                PERCENT,
            )
          : worthOf(scene, target, {
              effect: spell.effect,
              value: spell.value,
              rounds: spellPower,
            });
      return own + sum(countered);
    }
  }
}

/**
 * Заклинание, которое компьютер наколдует сейчас за сторону `side`; `undefined` — не колдует.
 * При равной пользе — дешевле; затем раньше в книге; цель — раньше в армии.
 */
export function chooseCast(state: BattleState, side: BattleSide): BattleCommand | undefined {
  const hero = state.sides[side].hero;
  if (hero === null) {
    return undefined;
  }
  const alive = state.stacks.filter((stack) => isAlive(stack) && !isMachine(stack));
  const scene: Scene = {
    state,
    foesOf: (stack) => alive.filter((other) => other.side !== stack.side),
  };
  let best: { spell: SpellDefinition; target: string; worth: number } | undefined;
  for (const spell of castableSpells(state, side)) {
    for (const target of alive) {
      if (!canTarget(spell, side, target)) {
        continue;
      }
      const worth = benefit(scene, side, hero.spellPower, spell, target);
      if (
        worth > 0 &&
        (best === undefined ||
          worth > best.worth ||
          (worth === best.worth && spell.cost < best.spell.cost))
      ) {
        best = { spell, target: target.id, worth };
      }
    }
  }
  return best === undefined
    ? undefined
    : { type: "battleCast", side, spell: best.spell.id, target: best.target };
}
