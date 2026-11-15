/**
 * Заклинания, меняющие поведение отряда: слепота, бешенство, контрудар, огненный щит.
 * Спецификация: docs/mechanics/69-spells-control.md.
 */
import type { SpellEffect } from "../spells.ts";
import { wound } from "./damage.ts";
import { rollInt } from "./draft.ts";
import type { BattleDraft } from "./draft.ts";
import { fireShieldOf, mirrorOf, spellDamagePercent } from "./effects.ts";
import { isMachine } from "./siege.ts";
import type { BattleSide } from "./types.ts";

type DraftStack = BattleDraft["stacks"][number];

/** Снимает с отряда действия этого вида и пишет об этом; мёртвым — молча. */
function drop(draft: BattleDraft, stack: DraftStack, kind: SpellEffect): void {
  for (const effect of stack.effects) {
    if (effect.effect === kind && stack.count > 0) {
      draft.events.push({
        type: "effectEnded",
        stackId: stack.id,
        spell: effect.spell,
        name: effect.name,
      });
    }
  }
  stack.effects = stack.effects.filter((effect) => effect.effect !== kind);
}

/** Отряд получил урон: слепота проходит. */
export function wake(draft: BattleDraft, stack: DraftStack): void {
  drop(draft, stack, "blind");
}

/** Отряд в берсерке ударил: берсерк проходит. */
export function sober(draft: BattleDraft, stack: DraftStack): void {
  drop(draft, stack, "berserk");
}

const PERCENT_DICE = 100;

/**
 * «Волшебное зеркало»: заклинание стороны `side`, направленное на чужой отряд `target`,
 * может отразиться на случайный живой отряд колдовавшего. Возвращает новую цель;
 * `undefined` — не отразилось. Жребий бросается, только когда зеркало есть.
 */
export function reflect(
  draft: BattleDraft,
  side: BattleSide,
  target: DraftStack,
  spell: { readonly id: string; readonly name: string },
): DraftStack | undefined {
  const chance = mirrorOf(target);
  if (target.side === side || chance === 0 || rollInt(draft, 1, PERCENT_DICE) > chance) {
    return undefined;
  }
  const own = draft.stacks.filter(
    (stack) => stack.side === side && stack.count > 0 && !isMachine(stack),
  );
  const to = own[rollInt(draft, 0, own.length - 1)];
  if (to !== undefined) {
    draft.events.push({
      type: "spellReflected",
      stackId: target.id,
      toId: to.id,
      spell: spell.id,
      name: spell.name,
    });
  }
  return to;
}

/** Отряд сделал своё действие: «Бешенство» проходит. */
export function calmDown(draft: BattleDraft, stack: DraftStack): void {
  drop(draft, stack, "frenzy");
}

/**
 * Может ли отряд ответить на удар; если да — ответ засчитан.
 * Обычно ответ один за раунд; «Контрудар» даёт лишние.
 */
export function takeRetaliation(stack: DraftStack): boolean {
  if (!stack.retaliated) {
    stack.retaliated = true;
    return true;
  }
  const extra = stack.effects.find(
    (effect) => effect.effect === "retaliations" && (effect.used ?? 0) < effect.value,
  );
  if (extra === undefined) {
    return false;
  }
  stack.effects = stack.effects.map((effect) =>
    effect === extra ? { ...effect, used: (effect.used ?? 0) + 1 } : effect,
  );
  return true;
}

/**
 * «Огненный щит» отряда `owner`: ударивший в ближнем бою получает долю урона `unguarded` —
 * удара без снижений от защиты (см. `strike`). Это урон заклинания огня: «Волшебство» героя
 * хозяина щита его увеличивает, защита от огня на ударившем — уменьшает.
 */
export function burn(
  draft: BattleDraft,
  owner: DraftStack,
  attacker: DraftStack,
  unguarded: number,
): void {
  const sorcery = draft.sides[owner.side].hero?.sorcery ?? 0;
  const share = Math.floor((unguarded * fireShieldOf(owner)) / 100);
  const raw = Math.floor((share * (100 + sorcery)) / 100);
  const damage = Math.floor((raw * spellDamagePercent(attacker, ["fire"])) / 100);
  if (damage <= 0 || attacker.count === 0) {
    return;
  }
  const losses = wound(attacker, damage);
  draft.events.push({
    type: "fireShield",
    stackId: owner.id,
    targetId: attacker.id,
    damage,
    killed: losses.killed,
    left: losses.count,
  });
  if (losses.count === 0) {
    draft.events.push({ type: "stackDied", stackId: attacker.id });
  }
}
