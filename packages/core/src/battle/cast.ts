/**
 * Заклинания героя в бою. Спецификация: docs/mechanics/62-battle-spells.md.
 */
import type { SpellDefinition } from "../spells.ts";
import { aimsAtCell, areaVictims } from "./area.ts";
import { applyDamage } from "./damage.ts";
import type { BattleDraft } from "./draft.ts";
import { reflect, wake } from "./control.ts";
import { castField, fieldRefusal, isFieldSpell } from "./field.ts";
import { castTrap, isTrapSpell } from "./traps.ts";
import { immuneTo, isHypnotized, spellDamagePercent } from "./effects.ts";
import { inField } from "./hex.ts";
import { isMachine } from "./siege.ts";
import type {
  BattleCommand,
  BattleHero,
  BattleRejectCode,
  BattleSide,
  BattleState,
  SpellOutcome,
  StackState,
} from "./types.ts";

type CastCommand = Extract<BattleCommand, { type: "battleCast" }>;
type DraftStack = BattleDraft["stacks"][number];
type Refusal = { readonly code: BattleRejectCode; readonly message: string };

type Caster = Pick<BattleHero, "spellPower" | "sorcery">;

/**
 * Урон или лечение заклинания: множитель × сила магии + прибавка.
 * Урон с «Волшебством» больше на его проценты; дробь отбрасывается.
 */
export function spellValue(spell: SpellDefinition, hero: Caster): number {
  const raw = spell.power * hero.spellPower + spell.value;
  return spell.effect === "damage" ? Math.floor((raw * (100 + hero.sorcery)) / 100) : raw;
}

/**
 * Урон заклинания по отряду: у цепной молнии каждому следующему вдвое меньше (`divisor`),
 * защита от школы — у кого она есть. Дробь отбрасывается.
 */
export function spellDamageTo(
  spell: SpellDefinition,
  hero: Caster,
  target: StackState,
  divisor = 1,
): number {
  const raw = Math.floor(spellValue(spell, hero) / divisor);
  return Math.floor((raw * spellDamagePercent(target, spell.schools)) / 100);
}

/** Отряды, на которые ляжет заклинание, наколдованное на `target`: у заклинания «на всех» — все подходящие. */
export function spellTargetsOf<T extends StackState>(
  stacks: readonly T[],
  spell: SpellDefinition,
  side: BattleSide,
  target: T,
): T[] {
  // Заклинание «на всех» отряды под гипнозом пропускает (69-spells-control.md).
  return spell.mass === true
    ? stacks.filter((stack) => canTarget(spell, side, stack) && !isHypnotized(stack))
    : [target];
}

/** Наибольшее здоровье отряда, который возьмёт «Гипноз»: 25 × сила магии + прибавка. */
export function hypnosisLimit(spell: SpellDefinition, hero: Caster): number {
  return spell.power * hero.spellPower + spell.value;
}

function totalHealth(stack: StackState): number {
  return (stack.count - 1) * stack.creature.health + stack.firstHealth;
}

/**
 * Может ли заклинание лечь на этот отряд: свой или чужой, живой, не машина (кроме урона).
 * `caster` нужен «Гипнозу»: без него порог здоровья не проверяется.
 */
export function canTarget(
  spell: SpellDefinition,
  side: BattleSide,
  target: StackState,
  caster?: Caster,
): boolean {
  if (target.count === 0 || (spell.area !== undefined && spell.area !== "chain")) {
    return false;
  }
  if (isFieldSpell(spell)) {
    return false;
  }
  if (isMachine(target) && (spell.effect !== "damage" || spell.spareMachines === true)) {
    return false;
  }
  if (immuneTo(target, spell.level)) {
    return false;
  }
  if (
    spell.effect === "hypnosis" &&
    caster !== undefined &&
    totalHealth(target) > hypnosisLimit(spell, caster)
  ) {
    return false;
  }
  // «Забывчивость» — только тем, кому есть чем стрелять.
  if (spell.effect === "shotDown" && target.shots === 0) {
    return false;
  }
  // «Точность» — только тем, у кого выстрелы от природы.
  if (spell.effect === "shotAttack" && target.creature.shots === 0) {
    return false;
  }
  if (spell.target === "any") {
    return true;
  }
  return spell.target === "ally" ? target.side === side : target.side !== side;
}

/** Заклинания, на которые герою стороны сейчас хватает маны; колдовал в этом раунде — пусто. */
export function castableSpells(state: BattleState, side: BattleSide): SpellDefinition[] {
  const { hero, cast: done } = state.sides[side];
  if (hero === null || done) {
    return [];
  }
  return hero.spells.filter((spell) => spell.cost <= hero.mana);
}

/** Что мешает колдовать; `null` — можно. Порядок проверок — из 62-battle-spells.md. */
export function castRefusal(state: BattleState, command: CastCommand): Refusal | null {
  const side = state.sides[command.side];
  const { hero } = side;
  if (hero === null) {
    return { code: "NO_HERO", message: "Колдовать некому: у стороны нет героя." };
  }
  const spell = hero.spells.find((candidate) => candidate.id === command.spell);
  if (spell === undefined) {
    return { code: "UNKNOWN_SPELL", message: `Заклинания «${command.spell}» герой не знает.` };
  }
  if (side.cast) {
    return { code: "ALREADY_CAST", message: "В этом раунде герой уже колдовал." };
  }
  if (hero.mana < spell.cost) {
    return { code: "NOT_ENOUGH_MANA", message: `Нужно маны: ${spell.cost}.` };
  }
  if (isFieldSpell(spell)) {
    return fieldRefusal(state, command, spell);
  }
  if (spell.area === "all") {
    return null;
  }
  if (aimsAtCell(spell)) {
    return command.cell !== undefined && inField(command.cell)
      ? null
      : { code: "BAD_SPELL_CELL", message: `«${spell.name}» колдуют в клетку поля.` };
  }
  const target = state.stacks.find((stack) => stack.id === command.target);
  if (target === undefined || target.count === 0) {
    return { code: "UNKNOWN_TARGET", message: `Отряда «${command.target ?? ""}» нет на поле.` };
  }
  if (!canTarget(spell, command.side, target, hero)) {
    return { code: "BAD_SPELL_TARGET", message: `«${spell.name}» на этот отряд не накладывается.` };
  }
  return null;
}

function remove(target: DraftStack, drop: (effect: StackState["effects"][number]) => boolean) {
  const removed = target.effects.filter(drop).map((effect) => effect.spell);
  target.effects = target.effects.filter((effect) => !drop(effect));
  return removed;
}

const FRENZY_ROUNDS = 2;

function resolve(
  spell: SpellDefinition,
  hero: Caster,
  side: BattleSide,
  target: DraftStack,
  divisor = 1,
): SpellOutcome {
  const { health } = target.creature;
  const { spellPower } = hero;
  switch (spell.effect) {
    case "damage": {
      const damage = spellDamageTo(spell, hero, target, divisor);
      const losses = applyDamage(target.count, target.firstHealth, health, damage);
      target.count = losses.count;
      target.firstHealth = losses.firstHealth;
      return { kind: "damage", damage, killed: losses.killed, left: losses.count };
    }
    case "heal": {
      // Лечит только раненое существо: погибших не возвращает.
      const healed = Math.min(spellValue(spell, hero), health - target.firstHealth);
      target.firstHealth += healed;
      return { kind: "heal", healed, removed: remove(target, (effect) => effect.negative) };
    }
    case "dispel":
      return { kind: "dispel", removed: remove(target, () => true) };
    default: {
      // Действие на срок: то же заклинание заменяется, противоположные снимаются.
      // Срок — сила магии, но не меньше раунда: при силе 0 действие держится до конца раунда.
      // «Бешенство» — до следующего действия отряда, но не дольше конца следующего раунда;
      // «Берсерк» — до удара отряда, но не дольше конца раунда.
      const rounds =
        spell.effect === "frenzy"
          ? FRENZY_ROUNDS
          : spell.effect === "berserk"
            ? 1
            : Math.max(1, spellPower);
      // «Антимагия» снимает всё вредное.
      const cleanses = spell.effect === "spellImmunity";
      const removed = remove(
        target,
        (effect) => spell.counters.includes(effect.spell) || (cleanses && effect.negative),
      );
      const old = target.effects.find((effect) => effect.spell === spell.id);
      remove(target, (effect) => effect.spell === spell.id);
      const added = {
        spell: spell.id,
        name: spell.name,
        effect: spell.effect,
        value: spell.value,
        school: spell.protects ?? null,
        negative: target.side !== side || spell.effect === "berserk",
        rounds,
      };
      if (spell.cumulative === true) {
        // До конца боя; новое наложение прибавляется к прежним.
        const stacks = (old?.stacks ?? 0) + 1;
        const value = (old?.value ?? 0) + spell.value;
        target.effects = [...target.effects, { ...added, value, rounds: 1, stacks }];
        return { kind: "effect", rounds: 0, removed };
      }
      target.effects = [...target.effects, added];
      return { kind: "effect", rounds, removed };
    }
  }
}

/** Колдует: тратит ману, меняет цель, пишет события. Команда уже проверена. */
export function cast(draft: BattleDraft, command: CastCommand): void {
  const side = draft.sides[command.side];
  const { hero } = side;
  const spell = hero?.spells.find((candidate) => candidate.id === command.spell);
  if (hero === null || spell === undefined) {
    return;
  }
  if (isFieldSpell(spell)) {
    // Заклинание поля: отрядов не задевает, событие одно — о самом колдовстве.
    hero.mana -= spell.cost;
    side.cast = true;
    draft.events.push({
      type: "fieldCast",
      side: command.side,
      spell: spell.id,
      name: spell.name,
      manaLeft: hero.mana,
    });
    if (isTrapSpell(spell)) {
      castTrap(draft, command, spell, hero);
    } else {
      castField(draft, command, spell);
    }
    return;
  }
  const target = draft.stacks.find((stack) => stack.id === command.target);
  const alive = draft.stacks.filter((stack) => stack.count > 0);
  let victims =
    spell.area !== undefined
      ? areaVictims(alive, spell, command)
      : target === undefined
        ? []
        : spellTargetsOf(draft.stacks, spell, command.side, target).map((stack) => ({
            stack,
            divisor: 1,
          }));
  if (spell.effect !== "damage") {
    // «Берсерк» по площади: катапульту не берёт.
    victims = victims.filter(({ stack }) => !isMachine(stack));
  }
  hero.mana -= spell.cost;
  side.cast = true;
  // Отражённое заклинание ложится на отряд колдовавшего как вражеское.
  let from = command.side;
  const mirrored =
    spell.area === undefined && spell.mass !== true && target !== undefined
      ? reflect(draft, command.side, target, spell)
      : undefined;
  if (mirrored !== undefined) {
    from = command.side === 0 ? 1 : 0;
    victims = canTarget(spell, from, mirrored, hero) ? [{ stack: mirrored, divisor: 1 }] : [];
  }
  if (victims.length === 0) {
    // Заклинание по площади никого не задело: мана потрачена.
    draft.events.push({
      type: "spellMissed",
      side: command.side,
      spell: spell.id,
      name: spell.name,
      manaLeft: hero.mana,
    });
  }
  // По событию на каждый отряд: в порядке армий, у цепной молнии — в порядке цепи.
  for (const { stack, divisor } of victims) {
    const outcome = resolve(spell, hero, from, stack, divisor);
    draft.events.push({
      type: "spellCast",
      side: command.side,
      spell: spell.id,
      name: spell.name,
      targetId: stack.id,
      manaLeft: hero.mana,
      outcome,
    });
    if (outcome.kind === "damage") {
      wake(draft, stack);
    }
    if (stack.count === 0) {
      stack.turn = "done";
      draft.events.push({ type: "stackDied", stackId: stack.id });
    }
  }
}

/** Начало раунда: герои снова могут колдовать, сроки действий убывают, истёкшие пропадают. */
export function startSpellRound(draft: BattleDraft): void {
  for (const side of draft.sides) {
    side.cast = false;
  }
  for (const stack of draft.stacks) {
    for (const effect of stack.effects) {
      if (effect.rounds <= 1 && effect.stacks === undefined && stack.count > 0) {
        draft.events.push({
          type: "effectEnded",
          stackId: stack.id,
          spell: effect.spell,
          name: effect.name,
        });
      }
    }
    stack.effects = stack.effects
      .filter((effect) => effect.rounds > 1 || effect.stacks !== undefined)
      .map((effect) =>
        effect.stacks === undefined ? { ...effect, rounds: effect.rounds - 1 } : effect,
      )
      // «Контрудар»: лишние ответные удары в новом раунде снова целы.
      .map((effect) => (effect.used === undefined ? effect : { ...effect, used: 0 }));
  }
}
