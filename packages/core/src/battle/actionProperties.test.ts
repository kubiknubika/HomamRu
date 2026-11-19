// Свойства из docs/mechanics/12-battle-actions.md: проверяются на случайных боях.
import { createRng, nextInt } from "../rng.ts";
import { describe, expect, it } from "vitest";
import { applyBattleCommand } from "./commands.ts";
import { speedOf } from "./effects.ts";
import { cellIndex, distance, type Cell } from "./hex.ts";
import { findStack } from "./queries.ts";
import { army, startBattle } from "./testkit.ts";
import type { BattleCommand, BattleState, StackState } from "./types.ts";

/** Все клетки поля 15×11. */
const CELLS = Array.from({ length: 11 }, (_unused, row) =>
  Array.from({ length: 15 }, (_inner, col) => ({ col, row })),
).flat();

/** Бой, где обе стороны ходят по очереди; броски настоящие, не подставленные. */
function battle(seed: number): BattleState {
  return startBattle(
    army(["militia:20", "slinger:15", "falcon:8"], { morale: 1, luck: 1 }),
    army(["militia:18", "slinger:12", "falcon:6"], { morale: -1 }),
    { seed },
  ).state;
}

/** Детерминированные «кости» для выбора команды. */
function roller(seed: number): () => number {
  let rng = createRng(seed);
  return (): number => {
    const next = nextInt(rng, 0, 1_000_000);
    ({ rng } = next);
    return next.value;
  };
}

/** Соседняя с целью клетка, до которой отряд дотянется. */
function cellNear(state: BattleState, target: StackState): Cell | null {
  const team = state.stacks.filter((stack) => stack.count > 0);
  for (const cell of CELLS) {
    if (distance(cell, target) !== 1) {
      continue;
    }
    if (team.some((stack) => stack.col === cell.col && stack.row === cell.row)) {
      continue;
    }
    if (state.obstacles.some((item) => item.col === cell.col && item.row === cell.row)) {
      continue;
    }
    return cell;
  }
  return null;
}

/** Случайная команда от того, чей сейчас ход: часть из них ядро отклонит. */
function randomCommand(state: BattleState, roll: () => number): BattleCommand {
  const active = findStack(state, state.activeStack ?? "");
  const side = active?.side ?? 0;
  const target = state.stacks.find((stack) => stack.side !== side && stack.count > 0);
  const to = CELLS[roll() % CELLS.length] ?? { col: 0, row: 0 };
  if (active !== undefined && target !== undefined) {
    // Ближний бой: иначе случайные клетки не сводят отряды и отвечать некому.
    const near = cellNear(state, target);
    if (near !== null && distance(active, target) === 1) {
      return { type: "battleAttack", side, target: target.id, from: near };
    }
    if (near !== null && distance(active, near) <= speedOf(active)) {
      return { type: "battleMove", side, to: near };
    }
  }
  switch (roll() % 7) {
    case 0:
      return { type: "battleWait", side };
    case 1:
      return { type: "battleDefend", side };
    case 2:
      return {
        type: "battleAttack",
        side,
        target: target?.id ?? "",
        from: { col: active?.col ?? 0, row: active?.row ?? 0 },
      };
    case 3:
      return { type: "battleShoot", side, target: target?.id ?? "" };
    default:
      return { type: "battleMove", side, to };
  }
}

describe("свойство: принятое перемещение — не дальше скорости", () => {
  it("на случайных командах 200 боёв", { timeout: 120_000 }, () => {
    let moves = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const roll = roller(seed * 31);
      let state = battle(seed);
      for (let step = 0; step < 60 && state.result === null; step += 1) {
        const before = findStack(state, state.activeStack ?? "");
        const result = applyBattleCommand(state, randomCommand(state, roll));
        if (!result.ok) {
          continue;
        }
        const moved = result.events.find((event) => event.type === "stackMoved");
        if (moved !== undefined && moved.type === "stackMoved" && before !== undefined) {
          const walked = distance(moved.from, moved.to);
          if (walked > speedOf(before)) {
            throw new Error(`сид ${seed}: шаг ${walked} при скорости ${speedOf(before)}`);
          }
          moves += 1;
        }
        state = result.state;
      }
    }
    // Проверка не пустая: перемещения действительно были.
    expect(moves).toBeGreaterThan(100);
  });
});

describe("свойство: число существ и выстрелы не растут", () => {
  it("на случайных командах 200 боёв", { timeout: 120_000 }, () => {
    let strikes = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const roll = roller(seed * 17);
      let state = battle(seed);
      const start = new Map(state.stacks.map((stack) => [stack.id, stack]));
      for (let step = 0; step < 60 && state.result === null; step += 1) {
        const result = applyBattleCommand(state, randomCommand(state, roll));
        if (!result.ok) {
          continue;
        }
        state = result.state;
        strikes += result.events.filter((event) => event.type === "strike").length;
        for (const stack of state.stacks) {
          const first = start.get(stack.id);
          if (first === undefined) {
            continue;
          }
          if (stack.count > first.count) {
            throw new Error(`сид ${seed}: ${stack.id} вырос с ${first.count} до ${stack.count}`);
          }
          if (stack.shots > first.shots) {
            throw new Error(`сид ${seed}: ${stack.id} выстрелов ${first.shots} → ${stack.shots}`);
          }
        }
      }
    }
    expect(strikes).toBeGreaterThan(100);
  });
});

describe("свойство: за раунд не больше одного ответного удара", () => {
  it("на случайных командах 200 боёв", { timeout: 120_000 }, () => {
    let retaliations = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const roll = roller(seed * 13);
      let state = battle(seed);
      let perStack = new Map<string, number>();
      for (let step = 0; step < 60 && state.result === null; step += 1) {
        const result = applyBattleCommand(state, randomCommand(state, roll));
        if (!result.ok) {
          continue;
        }
        state = result.state;
        for (const event of result.events) {
          // Новый раунд — счётчики ответов чистые; так видно раунд каждого ответа.
          if (event.type === "roundStarted") {
            perStack = new Map();
            continue;
          }
          if (event.type !== "strike" || event.kind !== "retaliation") {
            continue;
          }
          const count = (perStack.get(event.attackerId) ?? 0) + 1;
          perStack.set(event.attackerId, count);
          if (count > 1) {
            throw new Error(`сид ${seed}: ${event.attackerId} ответил ${count} раз за раунд`);
          }
          retaliations += 1;
        }
      }
    }
    expect(retaliations).toBeGreaterThan(20);
  });
});

describe("свойство: отказ не меняет бой", () => {
  it("на случайных командах 300 попыток", { timeout: 120_000 }, () => {
    let rejected = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const roll = roller(seed * 7);
      const state = battle(seed);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const command = randomCommand(state, roll);
        const result = applyBattleCommand(state, command);
        if (result.ok) {
          continue;
        }
        rejected += 1;
        // Отказ: ни состояния, ни случайных чисел — повтор даёт тот же отказ.
        const again = applyBattleCommand(state, command);
        if (again.ok || again.code !== result.code) {
          throw new Error(`сид ${seed}: отказ ${result.code} не повторился`);
        }
        if ("state" in again || "events" in again) {
          throw new Error(`сид ${seed}: отказ ${result.code} вернул состояние`);
        }
        if (result.code !== again.code) {
          throw new Error(`сид ${seed}: отказ ${result.code} сменился на ${again.code}`);
        }
      }
    }
    expect(rejected).toBeGreaterThan(0);
  });
});

describe("свойство: двух отрядов в одной клетке нет", () => {
  it("после любой принятой команды", { timeout: 120_000 }, () => {
    let checked = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const roll = roller(seed * 3);
      let state = battle(seed);
      for (let step = 0; step < 30 && state.result === null; step += 1) {
        const result = applyBattleCommand(state, randomCommand(state, roll));
        if (!result.ok) {
          continue;
        }
        state = result.state;
        const alive = state.stacks.filter((stack) => stack.count > 0);
        const cells = new Set(alive.map((stack) => cellIndex(stack)));
        if (cells.size !== alive.length) {
          throw new Error(`сид ${seed}: два отряда в одной клетке`);
        }
        checked += 1;
      }
    }
    // Проверка не пустая: состояния действительно смотрели.
    expect(checked).toBeGreaterThan(500);
  });
});
