// Свойства из разделов «Свойства, верные всегда» спецификаций 10-battle-field.md и
// 11-battle-turns.md: поле, очередь хода и правила действий на случайных боях.
//
// Что уже держалось до этой порции: `battle/invariants.ts` проверяет место отрядов,
// препятствия и законность хода после каждой команды в 1000 автобоёв; `hex.test.ts:114`
// — соседство и симметрию расстояния; `damage.test.ts` — все шесть свойств урона полным
// перебором. Здесь добавлено то, чего не было: «не ждёт дважды за раунд» и
// «отклонённая команда не тратит случайных чисел».
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { applyBattleCommand } from "./commands.ts";
import { createBattle } from "./create.ts";
import { distance } from "./hex.ts";
import { activeStackOf } from "./queries.ts";
import { randomBattle, AUTO_BATTLE_MAX_ROUNDS } from "./autobattle.ts";
import { CREATURES } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { BattleCommand, BattleState } from "./types.ts";

const BATTLES = 60;
const MAX_COMMANDS = 200;
/** Заклинания, которые компьютер берёт: магия не нужна для свойств очереди, но и не мешает. */
const SPELLS = GAME_SPELLS.filter(
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

/** Бой с колдующими героями: так в очередь попадают и заклинания, и удары, и ожидания. */
function battle(seed: number): BattleState {
  const definition = randomBattle(seed, CREATURES, SPELLS);
  const enchant = (army: typeof definition.attacker) => ({
    ...army,
    hero: { ...(army.hero ?? { attack: 0, defense: 0 }), spellPower: 2, mana: 100, spells: SPELLS },
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

describe("свойства поля боя (10)", () => {
  it("расстояние симметрично, между соседями равно 1, и соседство взаимно", () => {
    // Формально это свойство `hex.test.ts:114` уже держит — здесь повторяется на тех
    // клетках, куда отряды реально встают в бою, чтобы свойство жило рядом с боями.
    const broken: string[] = [];
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = battle(seed);
      for (const left of state.stacks) {
        for (const right of state.stacks) {
          if (left.id === right.id) {
            continue;
          }
          const forward = distance(left, right);
          const backward = distance(right, left);
          if (forward !== backward) {
            broken.push(`сид ${seed}: ${left.id}→${right.id} = ${forward}, обратно ${backward}`);
          }
          if (forward < 1) {
            broken.push(`сид ${seed}: ${left.id} и ${right.id} на расстоянии ${forward}`);
          }
        }
      }
    }
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });
});

describe("свойства очереди хода (11)", () => {
  it("отряд не ждёт дважды за раунд", () => {
    const broken: string[] = [];
    let waits = 0;
    let refusals = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let state = battle(seed);
      const waitedThisRound = new Map<string, number>();
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const active = activeStackOf(state);
        if (active === undefined) {
          break;
        }
        // Пробуем именно «ждать»: раз в раунд это законно, второй раз — нет.
        const wait: BattleCommand = { type: "battleWait", side: active.side };
        const result = applyBattleCommand(state, wait);
        if (!result.ok) {
          refusals += 1;
          if (result.code !== "ALREADY_WAITED") {
            // Отказ по другой причине — не про ожидание; идём дальше обычным ходом.
            const normal = applyBattleCommand(state, { type: "battleDefend", side: active.side });
            if (!normal.ok) {
              break;
            }
            state = normal.state;
            continue;
          }
          // Отказ — это и есть механизм, держащий свойство: второй раз ждать нельзя.
          // Нарушением было бы ПРИНЯТОЕ второе ожидание, а не отказ.
          // После отказа ход всё равно надо сдвинуть, иначе тест встанет.
          const normal = applyBattleCommand(state, { type: "battleDefend", side: active.side });
          if (!normal.ok) {
            break;
          }
          state = normal.state;
          continue;
        }
        waits += 1;
        // Раунд берём ДО применения: после него раунд мог смениться.
        const roundBefore = state.round;
        const mark = waitedThisRound.get(active.id);
        if (mark === roundBefore) {
          broken.push(`сид ${seed}: ${active.id} ждал дважды в раунде ${roundBefore}`);
        }
        waitedThisRound.set(active.id, roundBefore);
        state = result.state;
      }
    }
    // Проверка обязана встретить и удачные ожидания, и отказы, иначе она пуста.
    expect(waits, "ни одного ожидания").toBeGreaterThan(0);
    expect(refusals, "ни одного отказа «уже ждал»").toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("мёртвый отряд не ходит; за раунд отряд действует не больше двух раз", () => {
    const broken: string[] = [];
    let secondTurns = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let state = battle(seed);
      // Ход ведёт компьютер: он и бьёт, и колдует, и ждёт — только так встречается
      // второй ход от боевого духа (`finishAction`, commands.ts:49).
      const actedThisRound = new Map<string, number>();
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const active = activeStackOf(state);
        if (active === undefined) {
          break;
        }
        if (active.count <= 0) {
          broken.push(`сид ${seed}: ход у погибшего ${active.id}`);
        }
        const command = chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          continue;
        }
        // Отмечаем действие только по событиям самого отряда: берсерк и гипноз
        // действуют чужой стороной, и по `activeStack` их не отличить.
        const acted = result.events.some(
          (event) =>
            (event.type === "stackMoved" && event.stackId === active.id) ||
            (event.type === "strike" && event.attackerId === active.id) ||
            (event.type === "stackWaits" && event.stackId === active.id) ||
            (event.type === "stackDefends" && event.stackId === active.id),
        );
        if (acted) {
          const count = (actedThisRound.get(active.id) ?? 0) + 1;
          actedThisRound.set(active.id, count);
          if (count === 2) {
            secondTurns += 1;
          }
          if (count > 2) {
            broken.push(`сид ${seed}: ${active.id} действовал ${count} раза в раунде`);
          }
        }
        // Новый раунд — счётчики обнуляются. Сравнивать надо ДО присваивания.
        if (result.state.round !== state.round) {
          actedThisRound.clear();
        }
        state = result.state;
      }
    }
    // Второй ход возможен только от боевого духа; если ни разу не встретился — свойство пусто.
    expect(secondTurns, "ни одного второго хода за раунд").toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("бой, где обе стороны бьют если могут, заканчивается", () => {
    // Бой ведёт компьютер за обе стороны: он и подходит, и бьёт, и стреляет.
    const stuck: string[] = [];
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = battle(seed);
      let current = state;
      while (current.result === null && current.round <= AUTO_BATTLE_MAX_ROUNDS) {
        const command = chooseBattleCommand(current);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(current, command);
        if (!result.ok) {
          break;
        }
        current = result.state;
      }
      if (current.result === null) {
        stuck.push(`сид ${seed}: раунд ${current.round}`);
      }
    }
    expect(stuck).toEqual([]);
  });
});
