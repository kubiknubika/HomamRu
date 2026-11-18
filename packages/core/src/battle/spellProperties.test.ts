// Свойства из раздела «Свойства, верные всегда» спецификации 62-battle-spells.md на
// случайных боях: компьютер ведёт бой за обе стороны и колдует заклинаниями всех школ.
// Случайность — от генератора ядра с сидом, поэтому тест при каждом запуске одинаков.
// До этой порции свойства боевой магии автоматикой на случайных боях не проверялись:
// мана ≥ 0 держал battle/invariants.ts, остальные четыре — никто.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { applyBattleCommand } from "./commands.ts";
import { findStack } from "./queries.ts";
import { createRng, nextInt } from "../rng.ts";
import type { RngState as Rng } from "../rng.ts";
import { randomBattle } from "./autobattle.ts";
import { createBattle } from "./create.ts";
import { CREATURES } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { BattleCommand, BattleState, StackState } from "./types.ts";

const BATTLES = 80;
const MAX_COMMANDS = 300;

/** Заклинания, которые вообще способны лечь на отряд: у карты и полей своя механика. */
const STACK_SPELLS = GAME_SPELLS.filter(
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

/** Случайный бой с колдующими героями: мана и сила магии достаточные, заклинания — все. */
function randomMagicBattle(seed: number): BattleState {
  const definition = randomBattle(seed, CREATURES, STACK_SPELLS);
  // Сила магии — в том числе 0: при ней срок действия обязан остаться не меньше раунда,
  // иначе свойство «срок не меньше 1» никогда не проверяется.
  const power = seed % 3 === 0 ? 0 : seed % 3 === 1 ? 1 : 4;
  const withHero = (army: (typeof definition)["attacker"]) =>
    army.hero === undefined
      ? {
          ...army,
          hero: { attack: 1, defense: 1, spellPower: power, mana: 200, spells: STACK_SPELLS },
        }
      : { ...army, hero: { ...army.hero, spellPower: power, mana: 200, spells: STACK_SPELLS } };
  const created = createBattle(
    {
      ...definition,
      attacker: withHero(definition.attacker),
      defender: withHero(definition.defender),
    },
    CREATURES,
    seed,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => `${error.field}: ${error.message}`).join("\n"));
  }
  return created.state;
}

/** Действия на отряде, которые снимают друг друга: «Ускорение» и «Замедление» и подобные. */
function countersOf(spellId: string): readonly string[] {
  return GAME_SPELLS.find((spell) => spell.id === spellId)?.counters ?? [];
}

/** Нарушенные свойства 62 после одной команды. */
function violations(state: BattleState): string[] {
  const broken: string[] = [];
  const broken2 = (holds: boolean, text: string): void => {
    if (!holds) {
      broken.push(text);
    }
  };

  // Мана героя в бою не меньше 0.
  for (const [index, side] of state.sides.entries()) {
    broken2((side.hero?.mana ?? 0) >= 0, `мана героя стороны ${index} меньше нуля`);
  }

  for (const stack of state.stacks) {
    if (stack.count <= 0) {
      continue;
    }
    const effects: readonly StackState["effects"][number][] = stack.effects;
    // На отряде нет двух одинаковых действий.
    const ids = effects.map((effect) => effect.spell);
    broken2(new Set(ids).size === ids.length, `${stack.id}: два одинаковых действия`);

    // …и нет пары, снимающей друг друга.
    for (const effect of effects) {
      for (const other of effects) {
        if (effect.spell === other.spell) {
          continue;
        }
        broken2(
          !countersOf(effect.spell).includes(other.spell),
          `${stack.id}: вместе «${effect.spell}» и «${other.spell}», а они снимают друг друга`,
        );
      }
    }

    // Срок каждого действия не меньше 1.
    for (const effect of effects) {
      broken2(
        effect.rounds >= 1 || effect.stacks !== undefined,
        `${stack.id}: у «${effect.spell}» срок ${effect.rounds}`,
      );
    }
  }

  return broken;
}

/** Ход компьютера за ту сторону, чей отряд сейчас ходит. */
function nextCommand(state: BattleState): BattleCommand | undefined {
  const command = chooseBattleCommand(state);
  if (command !== undefined) {
    return command;
  }
  const active = findStack(state, state.activeStack ?? "");
  return active === undefined ? undefined : { type: "battleWait", side: active.side };
}

describe("свойства боевой магии (62)", () => {
  it("на случайных боях свойства держатся после каждой команды", () => {
    const broken: string[] = [];
    let casts = 0;
    let effectsSeen = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let state = randomMagicBattle(seed);
      let rng: Rng = createRng(seed * 31_337);
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const command = nextCommand(state);
        if (command === undefined) {
          break;
        }
        // Изредка — заведомо неверная команда: отказ не должен ломать состояние.
        const rare = nextInt(rng, 0, 19);
        rng = rare.rng;
        const actual: BattleCommand =
          rare.value === 0 ? { type: "battleShoot", side: 1, target: "нет" } : command;
        const result = applyBattleCommand(state, actual);
        if (!result.ok) {
          continue;
        }
        state = result.state;
        if (actual.type === "battleCast") {
          casts += 1;
        }
        effectsSeen += state.stacks.reduce((sum, stack) => sum + stack.effects.length, 0);
        for (const text of violations(state)) {
          broken.push(`сид ${seed}, шаг ${step}: ${text}`);
        }
      }
    }
    expect(casts).toBeGreaterThan(0);
    expect(effectsSeen).toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("в раунде герой колдует не больше одного раза", () => {
    // На каждом состоянии после колдовства второй раз колдовать нельзя до конца раунда.
    for (let seed = 1; seed <= 20; seed += 1) {
      const start = randomMagicBattle(seed);
      const cast = {
        type: "battleCast" as const,
        side: 0 as const,
        spell: "magic-arrow",
        target: "b1",
      };
      const first = applyBattleCommand(start, cast);
      if (!first.ok) {
        continue;
      }
      const again = applyBattleCommand(first.state, cast);
      if (again.ok) {
        throw new Error(`сид ${seed}: герой колдовал дважды в раунде`);
      }
      expect(again.code).toBe("ALREADY_CAST");
    }
  });

  it("повтор команд боя даёт то же состояние: заклинания случайных чисел не тратят", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const start = randomMagicBattle(seed);
      // Один и тот же набор команд дважды — состояния совпадают побайтно.
      const once = playCommands(start, seed);
      const twice = playCommands(start, seed);
      expect(JSON.stringify(once.stacks)).toBe(JSON.stringify(twice.stacks));
      expect(JSON.stringify(once.sides)).toBe(JSON.stringify(twice.sides));
    }
  });
});

/** Проводит бой тем же путём, что и основной случай: компьютер за обе стороны. */
function playCommands(start: BattleState, seed: number): BattleState {
  let state = start;
  let rng: Rng = createRng(seed * 31_337);
  for (let step = 0; step < MAX_COMMANDS; step += 1) {
    if (state.result !== null) {
      break;
    }
    const command = nextCommand(state);
    if (command === undefined) {
      break;
    }
    const rare = nextInt(rng, 0, 19);
    rng = rare.rng;
    const actual: BattleCommand =
      rare.value === 0 ? { type: "battleShoot", side: 1, target: "нет" } : command;
    const result = applyBattleCommand(state, actual);
    if (!result.ok) {
      continue;
    }
    state = result.state;
  }
  return state;
}
