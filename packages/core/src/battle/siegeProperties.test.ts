// Свойства из раздела «Свойства, верные всегда» спецификации 50-siege.md на случайных
// осадах: компьютер ведёт бой за обе стороны, укрепления разной прочности, у нападающего
// бывают стрелки и летающие. Случайность — от генератора ядра с сидом, поэтому тест при
// каждом запуске одинаков. Часть свойств держит battle/invariants.ts (стена не занята
// отрядом, прочность ≥ 0, катапульта не считается отрядом); здесь — остальное.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { applyBattleCommand } from "./commands.ts";
import { findStack } from "./queries.ts";
import { createRng, nextInt } from "../rng.ts";
import type { RngState as Rng } from "../rng.ts";
import { gateOpen, isInside, isMachine, isMoat, WALL_PARTS, wallCells } from "./siege.ts";
import { army, startBattle } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { BattleCommand, BattleState } from "./types.ts";

const BATTLES = 60;
const MAX_COMMANDS = 400;
// "none" — не укрепление, а отсутствие осады: такого значения в типе нет и быть не может.
// Бой без форта проверяется отдельным случаем ниже.
const FORTS = ["fort", "citadel", "castle"] as const;
const ATTACKERS = [
  ["militia:40"],
  ["militia:40", "slinger:20"],
  ["slinger:30", "falcon:10"],
  ["militia:20", "slinger:15", "falcon:8"],
] as const;
const DEFENDERS = [["militia:20"], ["slinger:10", "militia:15"], ["armsman:5"]] as const;

/** Случайная осада: укрепление, армии и число зданий выбирает генератор. */
function randomSiege(seed: number): { state: BattleState; rng: Rng } {
  let rng = createRng(seed);
  const pick = <T>(items: readonly T[]): { value: T; rng: Rng } => {
    const roll = nextInt(rng, 0, items.length - 1);
    rng = roll.rng;
    return { value: items[roll.value] ?? (items[0] as T), rng };
  };
  const fort = pick(FORTS);
  const attacker = pick(ATTACKERS);
  const defender = pick(DEFENDERS);
  const buildings = pick([0, 1, 2, 3, 5, 8]);
  // Половине боёв даём героев с заклинаниями полей: иначе свойство «на клетках стены нет
  // построек» проверяется вхолостую — построек просто не бывает.
  const fieldSpells = GAME_SPELLS.filter((spell) =>
    ["fireWall", "forceField", "quicksand", "mine"].includes(spell.effect),
  );
  const magic = seed % 2 === 0;
  const attackerHero = magic
    ? army([...attacker.value], {
        hero: {
          attack: 0,
          defense: 0,
          spellPower: 3,
          mana: 200,
          sorcery: 100,
          spells: fieldSpells,
        },
      })
    : army([...attacker.value]);
  const defenderHero = magic
    ? army([...defender.value], {
        hero: {
          attack: 0,
          defense: 0,
          spellPower: 3,
          mana: 200,
          sorcery: 100,
          spells: fieldSpells,
        },
      })
    : army([...defender.value]);
  // Каждый четвёртый бой — без осады вовсе: так проверяется свойство «без форта нет машин».
  const started =
    seed % 4 === 0
      ? startBattle(attackerHero, defenderHero)
      : startBattle(attackerHero, defenderHero, {
          siege: { fortification: fort.value, buildings: buildings.value },
        });
  return { state: started.state, rng: buildings.rng };
}

/** Нарушенные свойства 50 после одной команды. */
function violations(before: BattleState, after: BattleState): string[] {
  const broken: string[] = [];
  const check = (holds: boolean, text: string): void => {
    if (!holds) {
      broken.push(text);
    }
  };

  // Без форта нет ни стены, ни башен, ни катапульты.
  if (before.siege === null) {
    check(after.siege === null, "без форта появилась осада");
    check(!after.stacks.some((stack) => isMachine(stack)), "без форта появилась машина");
  }

  if (after.siege !== null) {
    // Прочность не растёт и не опускается ниже нуля. Части, которых у этого укрепления
    // нет (у форта нет башен), не сравниваем: их прочность нулевая с самого начала.
    const sieged = after.siege;
    for (const part of WALL_PARTS) {
      const now = sieged.health[part];
      check(now >= 0, `прочность ${part} меньше нуля`);
      const was = before.siege?.health[part];
      if (was !== undefined) {
        check(now <= was, `прочность ${part} выросла: ${was} → ${now}`);
      }
    }

    // На клетках ворот и стены нет построек заклинаний; на рву — тоже.
    const walls = wallCells(after.siege);
    for (const field of after.fields ?? []) {
      for (const cell of field.cells) {
        check(
          !walls.some((wall) => wall.col === cell.col && wall.row === cell.row),
          `постройка на стене: ${cell.col},${cell.row}`,
        );
        check(!isMoat(after.siege, cell), `постройка на рву: ${cell.col},${cell.row}`);
      }
    }
    check(
      ![...(after.fields ?? [])].some((field) =>
        field.cells.some((cell) => cell.row === 5 && cell.col >= 8 && cell.col <= 10),
      ),
      "постройка на клетках ворот",
    );

    // Пеший нападающий не оказывается внутри, пока целы все участки и ворота закрыты.
    const segmentsWhole = (["wall1", "wall2", "wall3", "wall4"] as const).every(
      (part) => after.siege !== null && after.siege.health[part] > 0,
    );
    const gateHealth: number = after.siege.health.gate;
    const closed =
      gateHealth > 0 &&
      !gateOpen(
        after.siege,
        after.stacks.map((stack) => ({ count: stack.count, col: stack.col, row: stack.row })),
      );
    if (segmentsWhole && closed) {
      for (const stack of after.stacks) {
        if (stack.side !== 0 || stack.count <= 0 || isMachine(stack)) {
          continue;
        }
        // Летающие влетают через стену — им можно.
        if (stack.creature.flying === true) {
          continue;
        }
        check(!isInside(stack), `${stack.id} внутри при целой стене и закрытых воротах`);
        check(
          !walls.some((wall) => wall.col === stack.col && wall.row === stack.row),
          `${stack.id} стоит на стене`,
        );
      }
    }
  }

  // Катапульта не получает хода: у неё отметка «сходила», а не «готова».
  for (const stack of after.stacks) {
    if (isMachine(stack)) {
      check(stack.turn !== "ready", "катапульте отдан ход");
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

describe("свойства осады (50)", () => {
  it("на случайных осадах свойства держатся после каждой команды", () => {
    const broken: string[] = [];
    let accepted = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      const made = randomSiege(seed);
      let state = made.state;
      let rng = made.rng;
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
        const before = state;
        const result = applyBattleCommand(state, actual);
        if (!result.ok) {
          continue;
        }
        state = result.state;
        accepted += 1;
        for (const text of violations(before, state)) {
          broken.push(`сид ${seed}, шаг ${step}: ${text}`);
        }
      }
    }

    expect(accepted).toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("повтор боя по командам с тем же сидом даёт то же состояние", () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const first = randomSiege(seed).state;
      const second = randomSiege(seed).state;
      expect(JSON.stringify(first.stacks)).toBe(JSON.stringify(second.stacks));
      expect(first.siege?.health).toEqual(second.siege?.health);
    }
  });

  it("осада двух компьютеров кончается за конечное число раундов", () => {
    const unfinished: number[] = [];
    for (let seed = 1; seed <= 20; seed += 1) {
      let state = randomSiege(seed).state;
      let steps = 0;
      while (state.result === null && steps < MAX_COMMANDS) {
        const command = nextCommand(state);
        if (command === undefined) {
          break;
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          break;
        }
        state = result.state;
        steps += 1;
      }
      if (state.result === null) {
        unfinished.push(seed);
      }
    }
    expect(unfinished).toEqual([]);
  });
});
