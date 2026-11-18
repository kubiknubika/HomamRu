// Свойства из разделов «Свойства, верные всегда» спецификации 70-spells-field.md на случайных боях. Примеры на каждое правило есть в fieldSpells.test.ts
// и lifeSpells.test.ts, но свойства на многих боях до этой порции не проверялись:
// клонов и мин в случайных боях просто не появлялось.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { applyBattleCommand } from "./commands.ts";
import { randomBattle, randomSiege } from "./autobattle.ts";
import { createBattle } from "./create.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, cellIndex } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { isMoat, wallCells } from "./siege.ts";
import { CREATURES } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { BattleCommand, BattleDefinition, BattleState, StackState } from "./types.ts";

/** Постройки полей: их и проверяем в свойствах 70. */
const FIELD_SPELLS = GAME_SPELLS.filter((spell) =>
  ["forceField", "fireWall", "quicksand", "mine"].includes(spell.effect),
);
const BATTLES = 50;
const MAX_COMMANDS = 250;

/** Бой, где в книге только постройки полей: так они точно появятся. */
function fieldBattle(seed: number): BattleState {
  const definition =
    seed % 3 === 0
      ? randomSiege(seed, CREATURES, FIELD_SPELLS)
      : randomBattle(seed, CREATURES, FIELD_SPELLS);
  return enchantBattle(definition, FIELD_SPELLS, seed);
}

function enchantBattle(
  definition: BattleDefinition,
  spells: typeof GAME_SPELLS,
  seed: number,
): BattleState {
  // Сила магии 2: клон получает срок 2, «Воскрешение» поднимает заметно.
  const enchant = (army: BattleDefinition["attacker"]) => ({
    ...army,
    hero: {
      ...(army.hero ?? { attack: 0, defense: 0 }),
      spellPower: 2,
      mana: 300,
      spells,
    },
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

/** Прогоняет бой компьютером и зовёт `check` после каждой принятой команды. */
function play(state: BattleState, check: (after: BattleState) => void): BattleState {
  let current = state;
  for (let step = 0; step < MAX_COMMANDS; step += 1) {
    if (current.result !== null) {
      break;
    }
    const command = chooseBattleCommand(current);
    if (command === undefined) {
      break;
    }
    const result = applyBattleCommand(current, command);
    if (!result.ok) {
      continue;
    }
    current = result.state;
    check(current);
  }
  return current;
}

const alive = (stack: StackState): boolean => stack.count > 0;

/** Команда поставить постройку на свободную клетку: какую — берём из книги по кругу. */
function fieldCommand(state: BattleState): BattleCommand | undefined {
  const free: Cell[] = [];
  for (let col = 1; col < BATTLE_WIDTH - 1; col += 1) {
    for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
      const cell = { col, row };
      if (state.obstacles.some((item) => item.col === col && item.row === row)) {
        continue;
      }
      if (
        state.fields.some((field) =>
          field.cells.some((item) => item.col === col && item.row === row),
        )
      ) {
        continue;
      }
      free.push(cell);
    }
  }
  const spell = FIELD_SPELLS[state.fields.length % FIELD_SPELLS.length];
  const cell = free[(state.round * 37 + state.fields.length * 11) % Math.max(1, free.length)];
  if (spell === undefined || cell === undefined) {
    return undefined;
  }
  return { type: "battleCast", side: 0, spell: spell.id, cell };
}

describe("свойства заклинаний полей (70)", () => {
  it("в клетке не больше одной постройки; постройка не на препятствии, стене и во рву", () => {
    const broken: string[] = [];
    let fieldsSeen = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      play(fieldBattle(seed), (state) => {
        if (state.fields.length === 0) {
          return;
        }
        fieldsSeen += state.fields.length;
        // Одна клетка — одна постройка.
        const seen = new Map<number, string>();
        for (const field of state.fields) {
          for (const cell of field.cells) {
            const index = cellIndex(cell);
            const before = seen.get(index);
            if (before !== undefined) {
              broken.push(`сид ${seed}: «${before}» и «${field.kind}» в одной клетке`);
            }
            seen.set(index, field.kind);
            // Не на препятствии.
            if (
              state.obstacles.some(
                (obstacle) => obstacle.col === cell.col && obstacle.row === cell.row,
              )
            ) {
              broken.push(`сид ${seed}: «${field.kind}» на препятствии`);
            }
            // Не на стене и не во рву.
            const walls = state.siege === null ? [] : wallCells(state.siege);
            if (walls.some((wall) => wall.col === cell.col && wall.row === cell.row)) {
              broken.push(`сид ${seed}: «${field.kind}» на стене`);
            }
            if (state.siege !== null && isMoat(state.siege, cell)) {
              broken.push(`сид ${seed}: «${field.kind}» во рву`);
            }
            // И в пределах поля.
            if (
              cell.col < 0 ||
              cell.col >= BATTLE_WIDTH ||
              cell.row < 0 ||
              cell.row >= BATTLE_HEIGHT
            ) {
              broken.push(`сид ${seed}: «${field.kind}» вне поля`);
            }
          }
        }
      });
    }
    expect(fieldsSeen).toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("на клетке силового поля нет отрядов, постройка не переживает срок, мина бьёт один раз", () => {
    // Компьютер постройки полей не ставит вовсе: в aiSpells.ts у действий на отряды есть цена,
    // а у построек её нет — они получают 0 и никогда не выбираются. Поэтому свойства 70
    // проверяются на командах, поставленных вручную, а ход боя между ними ведёт компьютер.
    const broken: string[] = [];
    let placed = 0;
    let mineHits = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let state = fieldBattle(seed);
      let placedHere = 0;
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        // Каждую третью команду ставим постройку, остальные — ход компьютера.
        const wantsField = step % 3 === 0 && placedHere < 3;
        const command = wantsField ? fieldCommand(state) : chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        const beforeFields = state.fields;
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          if (wantsField) {
            // Отказ поставить — законно (клетка занята, маны нет), но не молча.
            placedHere += 1;
          }
          continue;
        }
        const after = result.state;
        if (wantsField && after.fields.length > beforeFields.length) {
          placed += 1;
          placedHere += 1;
        }
        // Отрядов на клетках силового поля нет.
        for (const field of after.fields.filter((item) => item.kind === "forceField")) {
          for (const stack of after.stacks.filter(alive)) {
            if (field.cells.some((cell) => cell.col === stack.col && cell.row === stack.row)) {
              broken.push(`сид ${seed}: отряд ${stack.id} на силовом поле`);
            }
          }
        }
        // Мина наносит урон не больше одного раза: сработавшая исчезает с поля.
        // Смотрим именно на событие взрыва, а не на «рядом была мина» — мин на поле много.
        for (const event of result.events) {
          if (
            event.type === "fieldRemoved" &&
            event.kind === "mine" &&
            event.reason === "exploded"
          ) {
            mineHits += 1;
            const cell = event.cells[0];
            const stayed = after.fields.some(
              (item) =>
                item.kind === "mine" &&
                item.cells.some((c) => c.col === cell?.col && c.row === cell?.row),
            );
            if (stayed) {
              broken.push(`сид ${seed}: мина осталась после взрыва`);
            }
          }
        }
        // Срок постройки не уходит в минус.
        for (const field of after.fields) {
          if (field.rounds < 0) {
            broken.push(`сид ${seed}: у «${field.kind}» срок ${field.rounds}`);
          }
        }
        state = after;
      }
    }
    // Свойства, которые не проверились ни разу, — провал, а не успех.
    expect(placed, "ни одной постановки").toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
    // Мины бьют не всегда: если ни одна не сработала, об этом надо сказать.
    if (mineHits === 0) {
      throw new Error("ни одна мина не сработала — свойство про единственный удар не проверено");
    }
  });
});
