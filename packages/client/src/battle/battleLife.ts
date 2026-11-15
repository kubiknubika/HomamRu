/**
 * Заклинания жизни на экране боя: «Воскрешение», «Клон», «Жертва» — кого можно выбрать,
 * что будет и что подсветить. Спецификация: docs/mechanics/71-spells-life.md.
 */
import type { BattleState, Cell, SpellAim, SpellDefinition, StackState } from "@homamru/core";
import {
  countAfter,
  lifeTarget,
  resurrectHealth,
  sacrificeHealth,
  sacrificeVictim,
} from "@homamru/core";

type Side = 0 | 1;
type Caster = { readonly spellPower: number };

interface LifeChoice {
  readonly targetId: string | null;
  readonly preview: string | null;
  readonly hint: string;
  readonly aim?: SpellAim | null;
  readonly confirm?: boolean;
  readonly confirmTitle?: string;
}

/** Строка книги: что делает заклинание жизни; `undefined` — заклинание не из этих. */
export function lifeText(spell: SpellDefinition, hero: Caster): string | undefined {
  if (spell.effect === "resurrect") {
    const term = spell.lasting === true ? "насовсем" : "до конца боя";
    return `поднимает погибших вашего отряда на ${resurrectHealth(spell, hero)} здоровья, ${term}`;
  }
  if (spell.effect === "clone") {
    const limit = spell.value >= 7 ? "любого существа" : `существа до ${spell.value} уровня`;
    const rounds = Math.max(1, hero.spellPower);
    return `копия вашего отряда (${limit}): гибнет от любого урона, раундов: ${rounds}`;
  }
  if (spell.effect === "sacrifice") {
    return `один ваш отряд гибнет, другой поднимается: (${hero.spellPower} + здоровье существа + ${spell.value}) за каждое отданное`;
  }
  return undefined;
}

function heroOf(state: BattleState, side: Side): Caster {
  return state.sides[side].hero ?? { spellPower: 0 };
}

/** Отряды, которые можно выбрать первой целью: и живые, и погибшие целиком. */
export function lifeTargets(state: BattleState, side: Side, spell: SpellDefinition): StackState[] {
  const hero = heroOf(state, side);
  return state.stacks.filter((stack) => lifeTarget(state, side, spell, hero, stack));
}

/** Отряды, которые можно отдать «Жертве» ради отряда `targetId`. */
export function lifeVictims(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  targetId: string | null,
): StackState[] {
  const target = state.stacks.find((stack) => stack.id === targetId);
  if (spell.effect !== "sacrifice" || target === undefined) {
    return [];
  }
  return state.stacks.filter((stack) => sacrificeVictim(side, spell, target, stack));
}

/** Погибшие отряды, которые сейчас можно поднять: на поле они видны бледными значками. */
export function lifeGhosts(state: BattleState, side: Side, spell: SpellDefinition): StackState[] {
  return spell.effect === "clone"
    ? []
    : lifeTargets(state, side, spell).filter((stack) => stack.count === 0);
}

function raisedText(stack: StackState, amount: number): string {
  const after = countAfter(stack, amount);
  return `${stack.creature.name}: станет ${after} из ${stack.initialCount}`;
}

/** Выбор сразу после книги. */
export function lifeStart(state: BattleState, side: Side, spell: SpellDefinition): LifeChoice {
  const none = lifeTargets(state, side, spell).length === 0;
  const what =
    spell.effect === "clone"
      ? "выберите свой отряд в зелёном кольце"
      : "выберите, кого поднять, — свой отряд в зелёном кольце; погибшие видны бледными";
  const hint = none ? `${spell.name}: подходящих отрядов нет.` : `${spell.name}: ${what}.`;
  return { targetId: null, preview: null, hint };
}

function at(stacks: readonly StackState[], cell: Cell): StackState | undefined {
  const here = stacks.filter((stack) => stack.col === cell.col && stack.row === cell.row);
  // В клетке погибшего может стоять живой: живой важнее.
  return here.find((stack) => stack.count > 0) ?? here[0];
}

/**
 * Касание клетки при выбранном заклинании жизни: `cast` — колдовать сейчас, иначе новый выбор.
 * «Воскрешение» и «Клон»: первое касание показывает, что будет, второе колдует.
 * «Жертва»: кого поднять, потом кого отдать, потом окно «Отдать отряд?».
 */
export function lifeTap(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  current: { readonly targetId: string | null },
  cell: Cell,
): { readonly cast: SpellAim } | { readonly choice: LifeChoice } {
  const hero = heroOf(state, side);
  const chosen = state.stacks.find((stack) => stack.id === current.targetId);
  if (spell.effect === "sacrifice" && chosen !== undefined) {
    const victim = at(lifeVictims(state, side, spell, chosen.id), cell);
    if (victim === undefined) {
      return { choice: lifeStart(state, side, spell) };
    }
    const preview = `${victim.creature.name} (${victim.count}) погибнет целиком. ${raisedText(chosen, sacrificeHealth(spell, hero, victim))}, насовсем`;
    return {
      choice: {
        targetId: chosen.id,
        preview,
        hint: `${spell.name}: ${preview}.`,
        aim: { target: chosen.id, victim: victim.id },
        confirm: true,
        confirmTitle: "Отдать отряд?",
      },
    };
  }
  const target = at(lifeTargets(state, side, spell), cell);
  if (target === undefined) {
    return { choice: lifeStart(state, side, spell) };
  }
  if (spell.effect === "sacrifice") {
    const hint = `${spell.name}: поднять — ${target.creature.name}. Теперь выберите, кого отдать, — свой отряд в жёлтом кольце.`;
    return { choice: { targetId: target.id, preview: null, hint } };
  }
  if (current.targetId === target.id) {
    return { cast: { target: target.id } };
  }
  const preview =
    spell.effect === "clone"
      ? `${target.creature.name}: рядом встанет клон, ${target.count}`
      : `${raisedText(target, resurrectHealth(spell, hero))}, ${spell.lasting === true ? "насовсем" : "до конца боя"}`;
  return {
    choice: {
      targetId: target.id,
      preview,
      hint: `${spell.name} — ${preview}. Коснитесь отряда ещё раз.`,
    },
  };
}
