/**
 * Замер сохранения на длинных партиях: закрывает хвост
 * «сохранение пишется целиком со всеми командами» из docs/roadmap.md, §5.
 *
 * Запись содержит состояние в начале партии и все команды по порядку, поэтому
 * её длина растёт вместе с числом команд, а пишется она после каждой команды.
 * Здесь считается, сколько это стоит: размер текста, время упаковки и время
 * разбора — на партиях в 1, 200 и 1000 команд.
 */
import { performance } from "node:perf_hooks";
import { createGame, replay } from "@homamru/core";
import type { Command, GameState } from "@homamru/core";
import { CONTENT, TEST_ARMY } from "@homamru/core/testkit";
import { decodeSave, encodeSave } from "@homamru/data";
import { describe, expect, it } from "vitest";

/** То же, что берёт клиент при загрузке: контент игры и армия героя. */
const DEFAULTS = { ...CONTENT, heroArmy: TEST_ARMY };

const MAP = {
  id: "long",
  name: "Длинная",
  terrain: Array.from({ length: 10 }, () => ".........."),
  players: [{ hero: { x: 1, y: 1, army: TEST_ARMY } }],
};

/** Партия из одних ожиданий: каждая команда принимается без боя. */
function played(count: number): { initial: GameState; state: GameState; commands: Command[] } {
  const created = createGame(MAP, 1, CONTENT);
  if (!created.ok) {
    throw new Error("карта не создалась");
  }
  const commands: Command[] = [];
  let state = created.state;
  for (let index = 0; index < count; index += 1) {
    const command: Command = { type: "endTurn", player: 0 };
    const next = replay(created.state, [...commands, command]);
    if (!next.ok) {
      break;
    }
    commands.push(command);
    state = next.state;
  }
  return { initial: created.state, state, commands };
}

function measure(count: number): {
  bytes: number;
  packMs: number;
  parseMs: number;
  commands: number;
} {
  const { initial, state, commands } = played(count);
  const body = { gameVersion: "test", initial, commands, state };
  const start = performance.now();
  let text = "";
  for (let round = 0; round < 20; round += 1) {
    text = encodeSave(body, 1);
  }
  const packMs = (performance.now() - start) / 20;
  const parseStart = performance.now();
  for (let round = 0; round < 20; round += 1) {
    expect(decodeSave(text, DEFAULTS).kind).toBe("ok");
  }
  const parseMs = (performance.now() - parseStart) / 20;
  return { bytes: Buffer.byteLength(text, "utf8"), packMs, parseMs, commands: commands.length };
}

describe("замер сохранения на длинных партиях", () => {
  it("1000 команд укладываются в доли мегабайта и в единицы миллисекунд", () => {
    const short = measure(1);
    const medium = measure(200);
    const long = measure(1000);
    const report = [
      `${String(short.commands)} команд: ${String(short.bytes)} Б, упаковка ${short.packMs.toFixed(2)} мс, разбор ${short.parseMs.toFixed(2)} мс`,
      `${String(medium.commands)} команд: ${String(medium.bytes)} Б, упаковка ${medium.packMs.toFixed(2)} мс, разбор ${medium.parseMs.toFixed(2)} мс`,
      `${String(long.commands)} команд: ${String(long.bytes)} Б, упаковка ${long.packMs.toFixed(2)} мс, разбор ${long.parseMs.toFixed(2)} мс`,
    ].join("\n");
    process.stdout.write(`\nЗАМЕР СОХРАНЕНИЯ\n${report}\n`);
    // Мерили настоящую длинную партию, а не три команды.
    expect(short.commands).toBe(1);
    expect(medium.commands).toBe(200);
    expect(long.commands).toBe(1000);
    // Длина растёт с командами — это и есть цена «пишем целиком».
    expect(long.bytes).toBeGreaterThan(medium.bytes);
    expect(medium.bytes).toBeGreaterThan(short.bytes);
    // Но даже тысяча команд — это килобайты и единицы миллисекунд.
    expect(long.bytes).toBeLessThan(1_000_000);
    expect(long.packMs).toBeLessThan(50);
    expect(long.parseMs).toBeLessThan(50);
  });
});
