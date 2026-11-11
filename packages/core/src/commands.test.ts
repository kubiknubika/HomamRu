import { describe, expect, it } from "vitest";
import { applyCommand, replay } from "./commands.ts";
import { fromPicture, openField } from "./testkit.ts";
import type { Command, GameState } from "./types.ts";

const PARTY: readonly Command[] = [
  { type: "moveHero", player: 0, heroId: "A", path: ["E", "SE", "S"] },
  { type: "endTurn", player: 0 },
  { type: "moveHero", player: 0, heroId: "A", path: ["SE", "E", "N", "NW"] },
  { type: "moveHero", player: 0, heroId: "A", path: ["W"] },
  { type: "endTurn", player: 0 },
  { type: "endTurn", player: 0 },
];

describe("общие причины отказа", () => {
  it("отклоняет неизвестную команду", () => {
    const command = { type: "dance", player: 0 } as unknown as Command;
    expect(applyCommand(openField(8), command)).toMatchObject({
      ok: false,
      code: "UNKNOWN_COMMAND",
    });
  });

  it("отклоняет неизвестного игрока", () => {
    expect(applyCommand(openField(8), { type: "endTurn", player: 5 })).toMatchObject({
      ok: false,
      code: "UNKNOWN_PLAYER",
    });
  });

  it("отклоняет команду игрока, чей ход не сейчас", () => {
    const { state } = fromPicture(["S..", "...", "..B"]);
    expect(applyCommand(state, { type: "endTurn", player: 1 })).toMatchObject({
      ok: false,
      code: "NOT_YOUR_TURN",
    });
    expect(
      applyCommand(state, { type: "moveHero", player: 1, heroId: "B", path: ["N"] }),
    ).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
  });

  it("отказ не меняет состояние", () => {
    const state = openField(8);
    const before = JSON.stringify(state);
    applyCommand(state, { type: "moveHero", player: 0, heroId: "A", path: ["E", "N"] });
    applyCommand(state, { type: "endTurn", player: 3 });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("повтор партии", () => {
  it("даёт одинаковый результат при повторе", () => {
    const first = replay(openField(8), PARTY);
    const second = replay(openField(8), PARTY);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
  });

  it("даёт конечное состояние и полный журнал", () => {
    const result = replay(openField(8), PARTY);
    if (!result.ok) {
      throw new Error(result.rejection.message);
    }
    // (0,0) → В, ЮВ, Ю → (2,2); на второй день ЮВ, В, С, СЗ, З → (2,1).
    expect(result.state).toMatchObject({ day: 4, heroes: [{ x: 2, y: 1, movement: 1000 }] });
    expect(result.events.map((event) => event.type)).toEqual([
      "heroStepped",
      "heroStepped",
      "heroStepped",
      "turnEnded",
      "dayStarted",
      "heroStepped",
      "heroStepped",
      "heroStepped",
      "heroStepped",
      "heroStepped",
      "turnEnded",
      "dayStarted",
      "turnEnded",
      "dayStarted",
    ]);
  });

  it("состояние переживает превращение в JSON и обратно", () => {
    const half = replay(openField(8), PARTY.slice(0, 3));
    if (!half.ok) {
      throw new Error(half.rejection.message);
    }
    const restored = JSON.parse(JSON.stringify(half.state)) as GameState;
    expect(restored).toEqual(half.state);
    const whole = replay(openField(8), PARTY);
    const resumed = replay(restored, PARTY.slice(3));
    expect(resumed.ok).toBe(true);
    expect(resumed.ok && whole.ok ? resumed.state : undefined).toEqual(
      whole.ok ? whole.state : null,
    );
  });

  it("называет команду, на которой партия разошлась", () => {
    const broken: Command[] = [
      { type: "endTurn", player: 0 },
      { type: "moveHero", player: 0, heroId: "A", path: ["N"] },
    ];
    expect(replay(openField(8), broken)).toMatchObject({
      ok: false,
      commandIndex: 1,
      rejection: { code: "STEP_BLOCKED" },
    });
  });

  it("в состоянии только целые числа, строки и списки", () => {
    const result = replay(openField(8), PARTY);
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/\d\.\d/);
    expect(text).not.toContain("null");
  });
});
