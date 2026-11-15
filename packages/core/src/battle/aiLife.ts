/**
 * Компьютер и заклинания жизни: «Воскрешение» и «Клон»; «Жертву» он не колдует.
 * Спецификация: docs/mechanics/71-spells-life.md.
 */
import type { SpellDefinition } from "../spells.ts";
import { HEALTH } from "./aiArea.ts";
import { strikeOf } from "./aiControl.ts";
import type { SpellAim } from "./area.ts";
import { countAfter, lifeTarget, resurrectHealth } from "./life.ts";
import type { BattleSide, BattleState, StackState } from "./types.ts";

type Found = { aim: SpellAim; worth: number } | undefined;

/** Сколько здоровья вернёт «Воскрешение» отряду: поднятые существа целиком. */
function raisedHealth(stack: StackState, amount: number): number {
  return (countAfter(stack, amount) - stack.count) * stack.creature.health;
}

/**
 * «Воскрешение» — отряду, которому вернётся больше всего здоровья; «Клон» — отряду с сильнейшим
 * ударом, польза — половина удара. Из равных — отряд раньше в армии.
 */
export function bestLifeCast(state: BattleState, side: BattleSide, spell: SpellDefinition): Found {
  const { hero } = state.sides[side];
  if (hero === null || spell.effect === "sacrifice") {
    return undefined;
  }
  let best: Found;
  for (const stack of state.stacks) {
    if (!lifeTarget(state, side, spell, hero, stack)) {
      continue;
    }
    const worth =
      spell.effect === "clone"
        ? Math.floor(strikeOf(stack) / 2)
        : raisedHealth(stack, resurrectHealth(spell, hero)) * HEALTH;
    if (worth > (best?.worth ?? 0)) {
      best = { aim: { target: stack.id }, worth };
    }
  }
  return best;
}
