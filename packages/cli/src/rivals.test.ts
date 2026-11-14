// Свойства из docs/mechanics/42-opponent.md на настоящих данных и бюджет скорости из stage-5.md.
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { applyCommand, computerCommand, createGame, replay } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { loadDefaults, loadRivalsMap } from "./files.ts";
import { RIVALS_DAYS, runComputerGames, showComputerGame } from "./rivals.ts";

const map = loadRivalsMap();
const content = loadDefaults();
const COMMAND_BUDGET_MS = 50;
const TURN_BUDGET_MS = 500;

function start(seed: number): GameState {
  const created = createGame(map, seed, content);
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

describe("партии компьютер против компьютера", () => {
  it("каждая партия кончается победой в отведённый срок, команды принимаются, ход короткий", () => {
    const run = runComputerGames(40, map, content);
    expect(run.failures).toEqual([]);
    expect(run.lines[0]).toBe(
      "Партий двух компьютеров на карте «Проверочная карта соперников»: 40, без победителя или с ошибкой: 0.",
    );
    expect(run.lines[1]).toMatch(/^Побед: игрок 1 — \d+, игрок 2 — \d+\.$/);
    const longestTurn = Number(/Команд за ход самое большее: (\d+)/.exec(run.lines[2] ?? "")?.[1]);
    expect(longestTurn).toBeGreaterThan(0);
    expect(longestTurn).toBeLessThan(30);
    expect(run.lines[3]).toMatch(/^Осад: \d+, город взят: \d+, нападающий бежал: \d+\.$/);
  });

  it("одна партия печатается целиком и кончается победой", () => {
    const run = showComputerGame(3, map, content);
    expect(run.ok).toBe(true);
    const text = run.lines.join("\n");
    expect(text).toContain(
      "Партия двух компьютеров на карте «Проверочная карта соперников», сид 3.",
    );
    expect(text).toContain("Партия окончена: победил игрок");
    expect(RIVALS_DAYS).toBe(120);
  });

  it("при одном сиде партия та же, и она повторяется по списку команд", () => {
    const commands = [];
    let state = start(5);
    for (let command = computerCommand(state); command !== undefined;) {
      const result = applyCommand(state, command);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        break;
      }
      commands.push(command);
      ({ state } = result);
      command = computerCommand(state);
    }
    expect(state.outcome).toBe("victory");
    const again = replay(start(5), commands);
    expect(again.ok && again.state).toEqual(state);
  });

  it("бюджет: одна команда не дольше 50 мс, весь ход не дольше 500 мс", () => {
    let state = start(1);
    let slowestCommand = 0;
    let slowestTurn = 0;
    let turnTime = 0;
    for (let count = 0; count < 5000 && state.outcome === null; count += 1) {
      const started = performance.now();
      const command = computerCommand(state);
      const result = command === undefined ? undefined : applyCommand(state, command);
      const spent = performance.now() - started;
      if (result === undefined || !result.ok) {
        break;
      }
      ({ state } = result);
      slowestCommand = Math.max(slowestCommand, spent);
      turnTime += spent;
      if (command?.type === "endTurn") {
        slowestTurn = Math.max(slowestTurn, turnTime);
        turnTime = 0;
      }
    }
    expect(state.outcome).toBe("victory");
    expect(slowestCommand).toBeLessThan(COMMAND_BUDGET_MS);
    expect(slowestTurn).toBeLessThan(TURN_BUDGET_MS);
  });
});
