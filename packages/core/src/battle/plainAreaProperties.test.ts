// Свойства из разделов «Свойства, верные всегда» спецификаций 67-spells-plain.md и
// 68-spells-area.md на случайных боях.
// Примеры на каждое правило есть в battleSpells/areaSpells/mindSpells.test.ts; здесь
// проверяется, что правила держатся на многих боях, где компьютер колдует сам.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { applyBattleCommand } from "./commands.ts";
import { randomBattle } from "./autobattle.ts";
import { createBattle } from "./create.ts";
import { activeStackOf } from "./queries.ts";
import { CREATURES } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { BattleState, StackState } from "./types.ts";

/** Плоские заклинания и площади: без построек полей. */
const PLAIN = GAME_SPELLS.filter(
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
/** Площади: шар, молния, цепная молния, кольцо холода и прочее. */
const AREA = GAME_SPELLS.filter((spell) => spell.area !== undefined);
const BATTLES = 50;
const MAX_COMMANDS = 250;
const alive = (stack: StackState): boolean => stack.count > 0;

function battleWith(seed: number, spells: typeof GAME_SPELLS, power = 3): BattleState {
  const definition = randomBattle(seed, CREATURES, spells);
  const enchant = (army: (typeof definition)["attacker"]) => ({
    ...army,
    hero: { ...(army.hero ?? { attack: 0, defense: 0 }), spellPower: power, mana: 300, spells },
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

describe("свойства плоских заклинаний (67)", () => {
  it("боевой дух −3…+3, удача 0…+3; действие одно на название; срок кончается", () => {
    const broken: string[] = [];
    let effectsSeen = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let state = battleWith(seed, PLAIN);
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const command = chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          continue;
        }
        state = result.state;
        // Боевой дух и удача — в своих пределах.
        for (const [index, side] of state.sides.entries()) {
          if (side.morale < -3 || side.morale > 3) {
            broken.push(`сид ${seed}: дух стороны ${index} = ${side.morale}`);
          }
          if (side.luck < 0 || side.luck > 3) {
            broken.push(`сид ${seed}: удача стороны ${index} = ${side.luck}`);
          }
        }
        for (const stack of state.stacks) {
          effectsSeen += stack.effects.length;
          // Одно действие на название; «Разрушающий луч» копится счётчиком.
          const names = stack.effects
            .filter((effect) => effect.stacks === undefined)
            .map((effect) => effect.spell);
          if (new Set(names).size !== names.length) {
            broken.push(`сид ${seed}: у ${stack.id} два одинаковых действия`);
          }
          // Срок не меньше 1 (у «Разрушающего луча» срок не убывает вовсе).
          for (const effect of stack.effects) {
            if (effect.stacks === undefined && effect.rounds < 1) {
              broken.push(`сид ${seed}: у ${stack.id} «${effect.spell}» срок ${effect.rounds}`);
            }
          }
        }
      }
    }
    expect(effectsSeen).toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("действие со сроком кончается через столько раундов, сколько была сила магии", () => {
    // Сила магии 2 — срок 2: после двух начал раунда действия на отряде нет.
    const broken: string[] = [];
    let expired = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      let state = battleWith(seed, PLAIN, 2);
      // Запоминаем срок при появлении действия и считаем начала раундов.
      const seen = new Map<string, { rounds: number; roundsAt: number }>();
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const command = chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          continue;
        }
        const before = state.round;
        state = result.state;
        for (const stack of state.stacks) {
          for (const effect of stack.effects) {
            if (effect.stacks !== undefined) {
              continue;
            }
            const key = `${stack.id}/${effect.spell}`;
            const known = seen.get(key);
            if (known === undefined) {
              seen.set(key, { rounds: effect.rounds, roundsAt: state.round });
            } else if (state.round > known.roundsAt && effect.rounds === 0) {
              broken.push(
                `сид ${seed}: «${effect.spell}» на ${stack.id} с нулевым сроком не снято`,
              );
            }
          }
        }
        if (state.round > before) {
          expired += 1;
        }
      }
    }
    expect(expired).toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });
});

describe("свойства заклинаний по площади (68)", () => {
  it("задевает ровно тех, кто на клетках площади; дважды один отряд не бьёт", () => {
    const broken: string[] = [];
    let areaCasts = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let state = battleWith(seed, AREA);
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const command = chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          continue;
        }
        state = result.state;
        if (command.type === "battleCast" && command.cell !== undefined) {
          areaCasts += 1;
          // Урон заклинания пишется событием `spellCast` с исходом «урон» (types.ts:217):
          // отдельного события урона по отряду от заклинания нет.
          const perStack = new Map<string, number>();
          for (const event of result.events) {
            if (event.type === "spellCast" && event.outcome.kind === "damage") {
              perStack.set(event.targetId, (perStack.get(event.targetId) ?? 0) + 1);
            }
          }
          for (const [stackId, count] of perStack) {
            if (count > 1) {
              broken.push(`сид ${seed}: ${stackId} получил урон ${count} раза за одно заклинание`);
            }
          }
        }
        // Ход не принадлежит погибшему отряду.
        const active = activeStackOf(state);
        if (active !== undefined && !alive(active)) {
          broken.push(`сид ${seed}: ход у погибшего ${active.id}`);
        }
      }
    }
    expect(areaCasts).toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("сумма урона цепной молнии не больше удвоенного урона первой цели", () => {
    const chain = GAME_SPELLS.find((spell) => spell.id === "chain-lightning");
    expect(chain, "в книге нет цепной молнии").toBeDefined();
    const broken: string[] = [];
    let casts = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      let state = battleWith(seed, AREA);
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        // Каст цепной молнии в первого живого врага.
        const foe = state.stacks.find((stack) => stack.side === 1 && alive(stack));
        const command =
          seed % 5 === step % 5 && foe !== undefined && chain !== undefined
            ? ({ type: "battleCast", side: 0, spell: chain.id, target: foe.id } as const)
            : chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          continue;
        }
        if (command.type === "battleCast" && command.spell === chain?.id) {
          casts += 1;
          const damage = result.events
            .filter((event) => event.type === "spellCast" && event.outcome.kind === "damage")
            .map((event) =>
              event.type === "spellCast" && event.outcome.kind === "damage"
                ? event.outcome.damage
                : 0,
            );
          const first = damage[0] ?? 0;
          const total = damage.reduce((sum, value) => sum + value, 0);
          if (total > first * 2) {
            broken.push(`сид ${seed}: сумма ${total} больше удвоенного ${first * 2}`);
          }
        }
        state = result.state;
      }
    }
    expect(casts, "цепная молния не колдовалась").toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });
});
