/** Сводка «маг против не мага»: равные армии, книга только у одной стороны (63-opponent-magic.md). */
import { randomBattle, runAutoBattle } from "@homamru/core";
import type { BattleDefinition, CreatureDefinition, SpellDefinition } from "@homamru/core";
import type { ScenarioRun } from "./scenario.ts";

const MANA = 30;
const MAX_POWER = 5;

/** Зеркальный бой: у обеих сторон армия нападающего из случайного боя; магия — у названной стороны. */
function mageDuel(
  seed: number,
  creatures: readonly CreatureDefinition[],
  spells: readonly SpellDefinition[],
  mage: 0 | 1 | null,
): BattleDefinition {
  const base = randomBattle(seed, creatures);
  const stats = base.attacker.hero ?? { attack: 0, defense: 0 };
  const magic = { spellPower: 1 + (seed % MAX_POWER), mana: MANA, spells };
  const army = (side: 0 | 1) => ({
    ...base.attacker,
    hero: side === mage ? { ...stats, ...magic } : stats,
  });
  return { ...base, attacker: army(0), defender: army(1) };
}

/** Проводит по три боя на сид: без магии, маг нападает, маг обороняется. */
export function runMageDuels(
  count: number,
  creatures: readonly CreatureDefinition[],
  spells: readonly SpellDefinition[],
): ScenarioRun {
  const failures: string[] = [];
  // Победы нападающего в каждом из трёх видов боя.
  const attackerWins = [0, 0, 0];
  const kinds = [null, 0, 1] as const;
  for (let seed = 1; seed <= count; seed += 1) {
    for (const [index, mage] of kinds.entries()) {
      const run = runAutoBattle(mageDuel(seed, creatures, spells, mage), creatures, seed);
      const winner = run.state?.result?.winner;
      if (run.problems.length > 0 || winner === undefined) {
        failures.push(`Сид ${seed}, вид ${index}: ${run.problems.join("; ") || "нет итога"}.`);
      } else if (winner === 0) {
        attackerWins[index] = (attackerWins[index] ?? 0) + 1;
      }
    }
  }
  const [plain = 0, mageAttacks = 0, mageDefends = 0] = attackerWins;
  const lines = [
    `Равных боёв: ${count} × 3, с ошибками: ${failures.length}.`,
    `Без магии: нападающий побеждает ${plain}, обороняющийся ${count - plain}.`,
    `Маг нападает: маг побеждает ${mageAttacks}, не маг ${count - mageAttacks}.`,
    `Маг обороняется: маг побеждает ${count - mageDefends}, не маг ${mageDefends}.`,
  ];
  return { ok: failures.length === 0, lines, failures };
}
