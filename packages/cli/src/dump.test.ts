// Проигрывание дампа: docs/mechanics/05-diagnostics.md.
import { applyCommand, createGame, STATE_VERSION } from "@homamru/core";
import type { Command } from "@homamru/core";
import { BUILDINGS, CREATURES, TEST_ARMY } from "@homamru/core/testkit";
import { buildDump } from "@homamru/data";
import { describe, expect, it } from "vitest";
import { runDump } from "./dump.ts";

const DEFAULTS = { creatures: CREATURES, buildings: BUILDINGS, heroArmy: TEST_ARMY };
const DEVICE = { screenWidth: 1, screenHeight: 1, pixelRatio: 1, platform: "web", userAgent: "" };
const COMMANDS: Command[] = [
  { type: "moveHero", player: 0, heroId: "A", path: ["E", "E"] },
  { type: "endTurn", player: 0 },
];

/** Дамп партии из двух команд; `change` правит его содержимое перед записью. */
function dumpText(change: (raw: Record<string, unknown>) => void = () => {}): string {
  const created = createGame(
    {
      id: "t",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [{ hero: { x: 1, y: 1, army: TEST_ARMY } }],
    },
    1,
    CREATURES,
    BUILDINGS,
  );
  if (!created.ok) {
    throw new Error("партия не создана");
  }
  let { state } = created;
  for (const command of COMMANDS) {
    const result = applyCommand(state, command);
    state = result.ok ? result.state : state;
  }
  const text = buildDump({
    gameVersion: "test",
    save: { gameVersion: "test", initial: created.state, commands: COMMANDS, state },
    error: null,
    device: DEVICE,
    createdAt: "2026-11-12T10:00:00.000Z",
  });
  const raw = JSON.parse(text) as Record<string, unknown>;
  change(raw);
  return JSON.stringify(raw);
}

/** Убирает из состояния всё, чего не было до шага 3.2. */
function asSecondVersion(state: Record<string, unknown>): void {
  state["version"] = 2;
  delete state["creatures"];
  delete state["battle"];
  delete state["outcome"];
  for (const hero of state["heroes"] as Record<string, unknown>[]) {
    for (const field of ["attack", "defense", "army", "experience", "level"]) {
      delete hero[field];
    }
  }
}

/** Портит дамп: состояние в нём перестаёт совпадать с повтором. */
function moved(raw: Record<string, unknown>): void {
  (raw["state"] as { day: number }).day = 9;
}

describe("проигрывание дампа", () => {
  it("дамп этой версии воспроизводится", () => {
    const run = runDump(dumpText(), DEFAULTS);
    expect(run).toMatchObject({ ok: true, failures: [] });
    expect(run.lines.join("\n")).toContain("Команд в партии: 2.");
    expect(run.lines.join("\n")).not.toContain("Дамп сделан версией состояния");
  });

  it("дамп другой версии состояния читается, как сохранение другой версии, и воспроизводится", () => {
    const text = dumpText((raw) => {
      raw["versions"] = { game: "0.2.0", state: 2 };
      asSecondVersion((raw["game"] as { initial: Record<string, unknown> }).initial);
      asSecondVersion(raw["state"] as Record<string, unknown>);
    });
    const run = runDump(text, DEFAULTS);
    expect(run).toMatchObject({ ok: true, failures: [] });
    expect(run.lines).toContain(
      `Дамп сделан версией состояния 2, игра понимает ${STATE_VERSION}: недостающее взято начальным, незнакомое убрано.`,
    );
    expect(run.lines.join("\n")).toContain("армия: Ополченец 10.");
  });

  it("повтор не сошёлся: для дампа другой версии названа возможная причина — разница правил", () => {
    expect(runDump(dumpText(moved), DEFAULTS).failures).toEqual([
      "Повтор партии не совпал с состоянием из дампа: нарушен детерминизм.",
    ]);
    const foreign = dumpText((raw) => {
      moved(raw);
      raw["versions"] = { game: "9.0.0", state: 99 };
    });
    expect(runDump(foreign, DEFAULTS).failures).toEqual([
      "Повтор партии не совпал с состоянием из дампа. Дамп сделан другой версией игры: причиной может быть разница правил, а не ошибка.",
    ]);
  });

  it("не дамп — отказ с объяснением", () => {
    expect(runDump("{", DEFAULTS).ok).toBe(false);
    expect(runDump('{"kind":"other"}', DEFAULTS).failures[0]).toContain("Это не дамп игры");
  });
});
