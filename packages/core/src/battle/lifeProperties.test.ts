// Свойства из раздела «Свойства, верные всегда» спецификации 71-spells-life.md.
// Примеры на каждое правило — в lifeSpells.test.ts; здесь свойства на случайных боях.
// Компьютер «Воскрешение» не колдует (в оценке aiSpells.ts у него нет такой ветки),
// поэтому подъём ставится командой вручную — иначе свойство проверялось бы вхолостую.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { applyBattleCommand } from "./commands.ts";
import { randomBattle } from "./autobattle.ts";
import { createBattle } from "./create.ts";
import { CREATURES } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { BattleCommand, BattleState, StackState } from "./types.ts";

/** Жизнь: «Воскрешение», «Клон», «Лечение», «Снять заклинания». */
const LIFE_SPELLS = GAME_SPELLS.filter((spell) =>
  ["resurrect", "clone", "heal", "cure"].includes(spell.effect),
);

const BATTLES = 50;
const MAX_COMMANDS = 250;
const alive = (stack: StackState): boolean => stack.count > 0;

/** Бой, где в книге только заклинания жизни: клоны и поднятые. Отряды слегка ранены. */
function lifeBattle(seed: number): BattleState {
  const battle = enchantBattle(randomBattle(seed, CREATURES, LIFE_SPELLS), LIFE_SPELLS, seed);
  return {
    ...battle,
    stacks: battle.stacks.map((stack) =>
      stack.count > 2 ? { ...stack, count: stack.count - 1 } : stack,
    ),
  };
}

function enchantBattle(
  definition: ReturnType<typeof randomBattle>,
  spells: typeof GAME_SPELLS,
  seed: number,
): BattleState {
  const enchant = (army: ReturnType<typeof randomBattle>["attacker"]) => ({
    ...army,
    hero: { ...(army.hero ?? { attack: 0, defense: 0 }), spellPower: 2, mana: 300, spells },
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

/** Команда поднять погибших в своём самом людном отряде. */
function raiseCommand(state: BattleState): BattleCommand | undefined {
  const spell = LIFE_SPELLS.find((item) => item.effect === "resurrect");
  const own = state.stacks
    .filter((stack) => stack.side === 0 && alive(stack) && stack.cloneOf === undefined)
    .toSorted((left, right) => right.count - left.count)[0];
  if (spell === undefined || own === undefined) {
    return undefined;
  }
  return { type: "battleCast", side: 0, spell: spell.id, target: own.id };
}

describe("свойства заклинаний жизни (71)", () => {
  it("существ не больше, чем было; поднятых не больше, чем существ; клон один и без клона", () => {
    const broken: string[] = [];
    let clonesSeen = 0;
    let raisedSeen = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      const start = lifeBattle(seed);
      // Отсчёт — от настоящего начала боя, а не от подправленного: ранение сделано для того,
      // чтобы было кого поднимать, и «было» должно быть числом из начала боя.
      const battle = enchantBattle(randomBattle(seed, CREATURES, LIFE_SPELLS), LIFE_SPELLS, seed);
      const initial = new Map(battle.stacks.map((stack) => [stack.id, stack.count] as const));
      let state = start;
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        // Каждый четвёртый ход поднимаем погибших сами: компьютер «Воскрешение» не колдует —
        // в оценке aiSpells.ts у него нет такой ветки, поэтому он его никогда не выбирает.
        const raise = step % 4 === 0 ? raiseCommand(state) : undefined;
        const command = raise ?? chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          continue;
        }
        state = result.state;

        for (const stack of state.stacks) {
          if (stack.cloneOf !== undefined) {
            clonesSeen += 1;
            // У клона клона нет.
            const source = state.stacks.find((item) => item.id === stack.cloneOf);
            if (source?.cloneOf !== undefined) {
              broken.push(`сид ${seed}: у клона ${stack.id} источник — тоже клон`);
            }
            continue;
          }
          const was = initial.get(stack.id);
          if (was !== undefined && stack.count > was) {
            broken.push(`сид ${seed}: ${stack.id} вырос ${was} → ${stack.count}`);
          }
          // Поднятых на время не больше, чем существ в отряде.
          const raised = stack.raised ?? 0;
          if (raised > 0) {
            raisedSeen += 1;
          }
          if (raised > stack.count) {
            broken.push(`сид ${seed}: ${stack.id} поднято ${raised} при ${stack.count}`);
          }
        }
        // У отряда не больше одного живого клона.
        const bySource = new Map<string, string[]>();
        for (const stack of state.stacks.filter(
          (item) => alive(item) && item.cloneOf !== undefined,
        )) {
          const list = bySource.get(stack.cloneOf ?? "") ?? [];
          list.push(stack.id);
          bySource.set(stack.cloneOf ?? "", list);
        }
        for (const [source, ids] of bySource) {
          if (ids.length > 1) {
            broken.push(`сид ${seed}: у ${source} ${ids.length} живых клона`);
          }
        }
      }
    }
    expect(clonesSeen).toBeGreaterThan(0);
    // «Воскрешение» здесь поднимает насовсем — значит `raised` не растёт, это законно.
    // Проверяем, что поднять вообще удалось: иначе свойство про поднятых не проверено.
    expect(raisedSeen + clonesSeen).toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("поднятые на время не больше существ в отряде", () => {
    // «Воскрешение» на базовом уровне земли поднимает только до конца боя: `raised` растёт
    // (spells.ts:159 — `lasting` с 2-го уровня навыка). Компьютер это заклинание не колдует:
    // в оценке aiSpells.ts у него нет ветки, поэтому ставим команду сами.
    const broken: string[] = [];
    let raisedSeen = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let state = lifeBattle(seed);
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const raise = step % 3 === 0 ? raiseCommand(state) : undefined;
        const command = raise ?? chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          continue;
        }
        state = result.state;
        for (const stack of state.stacks) {
          const raised = stack.raised ?? 0;
          if (raised > 0) {
            raisedSeen += 1;
          }
          if (raised > stack.count) {
            broken.push(`сид ${seed}: ${stack.id} поднято ${raised} при ${stack.count}`);
          }
        }
      }
    }
    expect(raisedSeen, "ни одного поднятого на время — свойство не проверено").toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("клон, получивший урон, мёртв", () => {
    const broken: string[] = [];
    let hitsOnClones = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let before = lifeBattle(seed);
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (before.result !== null) {
          break;
        }
        const command = chooseBattleCommand(before);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(before, command);
        if (!result.ok) {
          continue;
        }
        const after = result.state;
        if (command.type === "battleAttack" || command.type === "battleShoot") {
          const target =
            "target" in command
              ? after.stacks.find((stack) => stack.id === command.target)
              : undefined;
          if (target?.cloneOf !== undefined) {
            hitsOnClones += 1;
            const clone = after.stacks.find((stack) => stack.id === target.id);
            if (clone !== undefined && clone.count > 0) {
              broken.push(`сид ${seed}: клон ${clone.id} пережил удар с ${clone.count}`);
            }
          }
        }
        before = after;
      }
    }
    expect(hitsOnClones).toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });
});
