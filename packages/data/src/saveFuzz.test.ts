// Свойство из docs/mechanics/04-save.md: что бы ни лежало в записи, чтение не падает.
import { applyCommand, createRng, nextInt, renderState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { FULL_STATE as FULL, readTestState as readState } from "./testkit.ts";

/** Случайно портит данные: убирает поле, подменяет значение мусором или идёт вглубь. */
const JUNK: unknown[] = [null, -1, 1.5, "мусор", [], {}, 1e12, true];

function damage(value: unknown, roll: () => number): unknown {
  if (typeof value !== "object" || value === null || roll() % 4 === 0) {
    return JUNK[roll() % JUNK.length];
  }
  if (Array.isArray(value)) {
    const index = roll() % (value.length + 1);
    return value.map((item: unknown, i) => (i === index ? damage(item, roll) : item));
  }
  const entries = Object.entries(value);
  const [key] = entries[roll() % entries.length] ?? [""];
  if (roll() % 3 === 0) {
    return Object.fromEntries(entries.filter(([name]) => name !== key));
  }
  return Object.fromEntries(
    entries.map(([name, item]): [string, unknown] => [
      name,
      name === key ? damage(item, roll) : item,
    ]),
  );
}

describe("свойство: чтение никогда не падает", () => {
  it("испорченная запись либо отвергается, либо даёт состояние, с которым игра работает", () => {
    let rng = createRng(2026);
    const roll = (): number => {
      const next = nextInt(rng, 0, 1_000_000);
      ({ rng } = next);
      return next.value;
    };
    let loaded = 0;
    let rejected = 0;
    for (let round = 0; round < 3000; round += 1) {
      let state: unknown = FULL;
      for (let hits = (roll() % 3) + 1; hits > 0; hits -= 1) {
        state = damage(state, roll);
      }
      const read = readState(state);
      if (read === null) {
        rejected += 1;
        continue;
      }
      loaded += 1;
      // Прочитанное состояние устойчиво: повторное чтение ничего не меняет.
      const again = readState(read);
      const text = renderState(read);
      const ended = applyCommand(read, { type: "endTurn", player: read.currentPlayer });
      const stepped = applyCommand(read, {
        type: "moveHero",
        player: read.currentPlayer,
        heroId: read.heroes.find((hero) => hero.owner === read.currentPlayer)?.id ?? "A",
        path: ["E", "S", "W", "N"],
      });
      if (!sameJson(again, read) || text.length === 0 || !ended.ok || stepped === undefined) {
        throw new Error(`круг ${round}: состояние не годится: ${JSON.stringify(state)}`);
      }
    }
    // Проверка не пустая: были и загруженные, и отвергнутые записи.
    expect(loaded).toBeGreaterThan(500);
    expect(rejected).toBeGreaterThan(100);
  });
});

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
