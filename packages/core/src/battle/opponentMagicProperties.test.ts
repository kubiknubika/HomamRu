// Свойства из раздела «Свойства, верные всегда» спецификации 63-opponent-magic.md.
// До этой порции ни одно из четырёх не проверялось: автобои в autobattle.test.ts гоняют
// компьютер без героев-колдунов, поэтому колдовство компьютера не попадало в проверки вовсе.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { chooseCast } from "./aiSpells.ts";
import { applyBattleCommand } from "./commands.ts";
import { randomBattle, runAutoBattle, AUTO_BATTLE_MAX_ROUNDS } from "./autobattle.ts";
import { createBattle } from "./create.ts";
import { activeStackOf } from "./queries.ts";
import { CREATURES } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { BattleState } from "./types.ts";

/** Заклинания, которые компьютер вообще может взять: без построек полей и карты. */
const CASTABLE = GAME_SPELLS.filter(
  (spell) =>
    spell.area === undefined &&
    ![
      "forceField",
      "removeObstacle",
      "earthquake",
      "teleport",
      "fireWall",
      "quicksand",
      "mine",
    ].includes(spell.effect),
);

const CASTING_BATTLES = 60;
const MAX_COMMANDS = 250;

/** Бой, в котором колдуют оба героя: мана и сила магии достаточные, в руках вся книга. */
function castingBattle(seed: number, power = 3): BattleState {
  const definition = randomBattle(seed, CREATURES, CASTABLE);
  const enchant = (army: (typeof definition)["attacker"]) => ({
    ...army,
    hero:
      army.hero === undefined
        ? { attack: 1, defense: 1, spellPower: power, mana: 300, spells: CASTABLE }
        : { ...army.hero, spellPower: power, mana: 300, spells: CASTABLE },
  });
  const created = createBattle(
    {
      ...definition,
      attacker: enchant(definition.attacker),
      defender: enchant(definition.defender),
    },
    CREATURES,
    seed,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => `${error.field}: ${error.message}`).join("\n"));
  }
  return created.state;
}

describe("свойства компьютера-колдуна (63)", () => {
  it("команду колдовства компьютера ядро всегда принимает", () => {
    const refused: string[] = [];
    let casts = 0;
    for (let seed = 1; seed <= CASTING_BATTLES; seed += 1) {
      let state = castingBattle(seed);
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const active = activeStackOf(state);
        if (active === undefined) {
          break;
        }
        // Именно выбор колдовства, отдельно от хода отряда.
        const spell = chooseCast(state, active.side);
        if (spell === undefined) {
          const move = chooseBattleCommand(state);
          if (move === undefined) {
            break;
          }
          const moved = applyBattleCommand(state, move);
          if (!moved.ok) {
            refused.push(`сид ${seed}, шаг ${step}: ход отказан (${moved.code})`);
            break;
          }
          state = moved.state;
          continue;
        }
        casts += 1;
        const result = applyBattleCommand(state, spell);
        if (!result.ok) {
          refused.push(`сид ${seed}, шаг ${step}: колдовство отказано (${result.code})`);
          break;
        }
        state = result.state;
      }
    }
    expect(casts).toBeGreaterThan(0);
    expect([...new Set(refused)].slice(0, 5)).toEqual([]);
  });

  it("при одинаковом состоянии боя компьютер выбирает одно и то же", () => {
    for (let seed = 1; seed <= CASTING_BATTLES; seed += 1) {
      const state = castingBattle(seed);
      const pick = () => chooseBattleCommand(state);
      const first = pick();
      expect(first).toEqual(pick());
      expect(first).toEqual(pick());
    }
  });

  it("бой двух колдующих компьютеров заканчивается не позже чем за 200 раундов", () => {
    const failed: string[] = [];
    let longest = 0;
    for (let seed = 1; seed <= CASTING_BATTLES; seed += 1) {
      const definition = randomBattle(seed, CREATURES, CASTABLE);
      const enchant = (army: (typeof definition)["attacker"]) => ({
        ...army,
        hero: {
          ...(army.hero ?? { attack: 0, defense: 0 }),
          spellPower: 3,
          mana: 300,
          spells: CASTABLE,
        },
      });
      const run = runAutoBattle(
        {
          ...definition,
          attacker: enchant(definition.attacker),
          defender: enchant(definition.defender),
        },
        CREATURES,
        seed,
      );
      const winner = run.state?.result?.winner;
      if (run.problems.length > 0 || winner === undefined) {
        failed.push(`сид ${seed}: ${run.problems.join("; ") || "нет итога"}`);
        continue;
      }
      const rounds = run.state?.round ?? 0;
      longest = Math.max(longest, rounds);
      if (rounds > AUTO_BATTLE_MAX_ROUNDS) {
        failed.push(`сид ${seed}: ${rounds} раундов`);
      }
    }
    expect(longest).toBeLessThanOrEqual(AUTO_BATTLE_MAX_ROUNDS);
    expect(failed).toEqual([]);
  });
});
