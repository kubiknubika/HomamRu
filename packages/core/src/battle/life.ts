/**
 * Заклинания жизни: «Воскрешение», «Клон», «Жертва».
 * Спецификация: docs/mechanics/71-spells-life.md.
 */
import type { SpellDefinition } from "../spells.ts";
import type { BattleDraft } from "./draft.ts";
import { immuneTo, isHypnotized } from "./effects.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, cellIndex, distance } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { blockedCells } from "./queries.ts";
import type { BattleField } from "./queries.ts";
import { isInside, isMachine, isMoat } from "./siege.ts";
import type {
  BattleCommand,
  BattleHero,
  BattleRejectCode,
  BattleSide,
  StackState,
} from "./types.ts";

type CastCommand = Extract<BattleCommand, { type: "battleCast" }>;
type Refusal = { readonly code: BattleRejectCode; readonly message: string };
type Caster = Pick<BattleHero, "spellPower">;
type DraftStack = BattleDraft["stacks"][number];

const LIFE_EFFECTS = ["resurrect", "clone", "sacrifice"] as const;

/** Заклинание жизни: цель выбирается по своим правилам, не как у обычных. */
export function isLifeSpell(spell: SpellDefinition): boolean {
  return LIFE_EFFECTS.some((effect) => effect === spell.effect);
}

/** Здоровье всего отряда; у погибшего — ноль. */
export function healthOf(stack: StackState): number {
  return stack.count === 0 ? 0 : (stack.count - 1) * stack.creature.health + stack.firstHealth;
}

/** Сколько здоровья отряду не хватает до того, каким он начал бой. */
function missingOf(stack: StackState): number {
  return stack.initialCount * stack.creature.health - healthOf(stack);
}

/** Сколько здоровья даст «Воскрешение» этого героя. */
export function resurrectHealth(spell: SpellDefinition, hero: Caster): number {
  return spell.power * hero.spellPower + spell.value;
}

/** Сколько здоровья даст «Жертва», если отдать отряд `victim`. */
export function sacrificeHealth(spell: SpellDefinition, hero: Caster, victim: StackState): number {
  return (hero.spellPower + victim.creature.health + spell.value) * victim.count;
}

/** Сколько существ станет в отряде, если дать ему `amount` здоровья. */
export function countAfter(stack: StackState, amount: number): number {
  const pool = healthOf(stack) + Math.min(amount, missingOf(stack));
  return Math.ceil(pool / stack.creature.health);
}

/**
 * Можно ли поднимать отряд стороны `side`: свой, не катапульта, не клон, есть что возвращать;
 * погибший целиком — только если его клетка свободна.
 */
function raisable(state: BattleField, side: BattleSide, stack: StackState, level: number): boolean {
  if (stack.side !== side || isMachine(stack) || stack.cloneOf !== undefined) {
    return false;
  }
  if (missingOf(stack) <= 0 || immuneTo(stack, level)) {
    return false;
  }
  return stack.count > 0 || !blockedCells(state, side).has(cellIndex(stack));
}

/** Живой клон отряда, если он есть. */
function cloneOf(state: BattleField, stack: StackState): StackState | undefined {
  return state.stacks.find((other) => other.cloneOf === stack.id && other.count > 0);
}

/**
 * Куда встанет клон отряда: ближайшая свободная клетка, из равных — с меньшим номером;
 * в осаде — по ту же сторону стены и не в ров.
 */
export function cloneCell(state: BattleField, stack: StackState): Cell | undefined {
  const blocked = blockedCells(state, stack.side);
  let best: Cell | undefined;
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      const cell = { col, row };
      const fits =
        state.siege === null || (isInside(cell) === isInside(stack) && !isMoat(state.siege, cell));
      if (
        fits &&
        !blocked.has(cellIndex(cell)) &&
        (best === undefined || distance(stack, cell) < distance(stack, best))
      ) {
        best = cell;
      }
    }
  }
  return best;
}

/** Годится ли отряд первой целью заклинания жизни. */
export function lifeTarget(
  state: BattleField,
  side: BattleSide,
  spell: SpellDefinition,
  hero: Caster,
  stack: StackState,
): boolean {
  if (spell.effect === "clone") {
    return (
      stack.side === side &&
      stack.count > 0 &&
      !isMachine(stack) &&
      stack.cloneOf === undefined &&
      (stack.creature.level ?? 1) <= spell.value &&
      !immuneTo(stack, spell.level) &&
      cloneOf(state, stack) === undefined &&
      cloneCell(state, stack) !== undefined
    );
  }
  if (!raisable(state, side, stack, spell.level)) {
    return false;
  }
  // «Воскрешение» должно поднять хотя бы одно существо; «Жертве» хватит и раненого.
  return (
    spell.effect !== "resurrect" || countAfter(stack, resurrectHealth(spell, hero)) > stack.count
  );
}

/** Годится ли отряд в жертву ради отряда `target`. */
export function sacrificeVictim(
  side: BattleSide,
  spell: SpellDefinition,
  target: StackState,
  victim: StackState,
): boolean {
  return (
    victim.side === side &&
    victim.count > 0 &&
    victim.id !== target.id &&
    !isMachine(victim) &&
    victim.cloneOf === undefined &&
    !isHypnotized(victim) &&
    !immuneTo(victim, spell.level)
  );
}

function unknown(id: string | undefined): Refusal {
  return { code: "UNKNOWN_TARGET", message: `Отряда «${id ?? ""}» нет на поле.` };
}

/** Что мешает наколдовать заклинание жизни; `null` — можно. Мана и герой уже проверены. */
export function lifeRefusal(
  state: BattleField,
  command: CastCommand,
  spell: SpellDefinition,
  hero: Caster,
): Refusal | null {
  const bad: Refusal = {
    code: "BAD_SPELL_TARGET",
    message: `«${spell.name}» на этот отряд не накладывается.`,
  };
  const target = state.stacks.find((stack) => stack.id === command.target);
  if (target === undefined) {
    return unknown(command.target);
  }
  if (!lifeTarget(state, command.side, spell, hero, target)) {
    return bad;
  }
  if (spell.effect !== "sacrifice") {
    return null;
  }
  const victim = state.stacks.find((stack) => stack.id === command.victim);
  if (victim === undefined || victim.count === 0) {
    return unknown(command.victim);
  }
  return sacrificeVictim(command.side, spell, target, victim) ? null : bad;
}

/** Даёт отряду здоровье: долечивает раненого, поднимает погибших; снимает вредные заклинания. */
function raise(draft: BattleDraft, stack: DraftStack, amount: number, lasting: boolean): void {
  const before = stack.count;
  const healed = Math.min(amount, missingOf(stack));
  const pool = healthOf(stack) + healed;
  const { health } = stack.creature;
  stack.count = Math.ceil(pool / health);
  stack.firstHealth = pool - (stack.count - 1) * health;
  const raised = stack.count - before;
  if (!lasting) {
    stack.raised = (stack.raised ?? 0) + raised;
  }
  // Поднятый из погибших целиком встаёт без заклинаний; с живого снимаются вредные.
  stack.effects = before === 0 ? [] : stack.effects.filter((effect) => !effect.negative);
  if (before === 0) {
    stack.defendBonus = 0;
  }
  draft.events.push({
    type: "stackRaised",
    stackId: stack.id,
    raised,
    healed,
    lasting,
    left: stack.count,
  });
}

function makeClone(
  draft: BattleDraft,
  stack: DraftStack,
  hero: Caster,
  spell: SpellDefinition,
): void {
  const cell = cloneCell(draft, stack);
  if (cell === undefined) {
    return;
  }
  const id = `${stack.id}c`;
  const rounds = Math.max(1, hero.spellPower);
  // Прежний, уже погибший клон этого отряда больше не нужен.
  const old = draft.stacks.findIndex((other) => other.id === id);
  if (old !== -1) {
    draft.stacks.splice(old, 1);
  }
  draft.stacks.push({
    id,
    side: stack.side,
    slot: stack.slot,
    creature: stack.creature,
    count: stack.count,
    initialCount: stack.count,
    firstHealth: stack.creature.health,
    shots: stack.shots,
    col: cell.col,
    row: cell.row,
    turn: "ready",
    moraleUsed: false,
    retaliated: false,
    defendBonus: 0,
    // Срок клона — действие заклинания: «Снять заклинания» убирает клон.
    effects: [
      {
        spell: spell.id,
        name: spell.name,
        effect: spell.effect,
        value: 0,
        school: null,
        negative: false,
        rounds,
      },
    ],
    cloneOf: stack.id,
  });
  draft.events.push({ type: "cloneCreated", stackId: stack.id, cloneId: id, cell, rounds });
}

/** Колдует заклинание жизни. Команда уже проверена, мана уже списана. */
export function castLife(
  draft: BattleDraft,
  command: CastCommand,
  spell: SpellDefinition,
  hero: Caster,
): void {
  const target = draft.stacks.find((stack) => stack.id === command.target);
  if (target === undefined) {
    return;
  }
  if (spell.effect === "clone") {
    makeClone(draft, target, hero, spell);
    return;
  }
  if (spell.effect === "resurrect") {
    raise(draft, target, resurrectHealth(spell, hero), spell.lasting === true);
    return;
  }
  const victim = draft.stacks.find((stack) => stack.id === command.victim);
  if (victim === undefined) {
    return;
  }
  const amount = sacrificeHealth(spell, hero, victim);
  victim.count = 0;
  victim.firstHealth = 0;
  victim.raised = 0;
  draft.events.push({ type: "stackSacrificed", stackId: victim.id });
  draft.events.push({ type: "stackDied", stackId: victim.id });
  raise(draft, target, amount, true);
}

/** Клоны, у которых кончилось или снято действие «Клона», исчезают. */
export function dropClones(draft: BattleDraft, reason: "expired" | "dispelled"): void {
  for (const stack of draft.stacks) {
    const marked = stack.effects.some((effect) => effect.effect === "clone");
    if (stack.cloneOf !== undefined && stack.count > 0 && !marked) {
      stack.count = 0;
      stack.firstHealth = 0;
      draft.events.push({ type: "cloneGone", stackId: stack.id, reason });
    }
  }
}
