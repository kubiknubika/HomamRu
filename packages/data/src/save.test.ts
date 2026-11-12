import { applyCommand, createGame } from "@homamru/core";
import type { Command, GameState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { buildDump, DUMP_JOURNAL_COMMANDS, parseDump } from "./dump.ts";
import { chooseSave, decodeSave, encodeSave, sameData, verifySave } from "./save.ts";
import type { SaveBody } from "./save.ts";

function newState(): GameState {
  const created = createGame(
    {
      id: "t",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [{ hero: { x: 1, y: 1 } }],
    },
    1,
  );
  if (!created.ok) {
    throw new Error("карта не создалась");
  }
  return created.state;
}

/** Партия из данных команд; все они обязаны быть приняты. */
function play(commands: readonly Command[]): SaveBody {
  const initial = newState();
  let state = initial;
  for (const command of commands) {
    const result = applyCommand(state, command);
    if (!result.ok) {
      throw new Error(result.message);
    }
    state = result.state;
  }
  return { gameVersion: "test", initial, commands, state };
}

const MOVE: Command = { type: "moveHero", player: 0, heroId: "A", path: ["E", "S"] };
const END: Command = { type: "endTurn", player: 0 };

const DEVICE = {
  screenWidth: 800,
  screenHeight: 360,
  pixelRatio: 3,
  platform: "android",
  userAgent: "test",
};

describe("запись сохранения", () => {
  it("сохранить и сразу загрузить — то же состояние", () => {
    const body = play([MOVE, END]);
    const decoded = decodeSave(encodeSave(body, 7));
    expect(decoded).toEqual({ kind: "ok", record: { ...body, seq: 7 } });
  });

  it("запись с изменённым символом не загружается", () => {
    const text = encodeSave(play([MOVE]), 1);
    const broken = text.replace('"day":1', '"day":2');
    expect(broken).not.toBe(text);
    expect(decodeSave(broken)).toEqual({ kind: "corrupt" });
  });

  it("оборванная запись не загружается", () => {
    const text = encodeSave(play([MOVE]), 1);
    expect(decodeSave(text.slice(0, text.length / 2))).toEqual({ kind: "corrupt" });
    expect(decodeSave("")).toEqual({ kind: "corrupt" });
  });

  it("целая запись другого формата — «старая»", () => {
    const text = encodeSave(play([]), 1);
    const json = text.slice(text.indexOf("\n") + 1).replace('"format":1', '"format":0');
    // Старая сумма к новому тексту не подходит; с пересчитанной запись цела, но формат другой.
    expect(decodeSave(`${text.slice(0, text.indexOf("\n"))}\n${json}`)).toEqual({
      kind: "corrupt",
    });
    expect(decodeSave(withChecksumOf(json))).toEqual({ kind: "old" });
  });
});

/** Считает верную контрольную сумму для произвольного текста — тем же FNV-1a. */
function withChecksumOf(json: string): string {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}\n${json}`;
}

describe("выбор из двух копий", () => {
  const older = encodeSave(play([MOVE]), 4);
  const newer = encodeSave(play([MOVE, END]), 5);

  it("копий нет — сохранения нет", () => {
    expect(chooseSave([null, null])).toEqual({ kind: "none" });
  });

  it("берётся копия с большим порядковым номером", () => {
    expect(chooseSave([older, newer])).toMatchObject({ kind: "ok", slot: 1, record: { seq: 5 } });
    expect(chooseSave([newer, older])).toMatchObject({ kind: "ok", slot: 0, record: { seq: 5 } });
  });

  it("последняя запись оборвалась — берётся предыдущая", () => {
    const torn = newer.slice(0, 40);
    expect(chooseSave([older, torn])).toMatchObject({ kind: "ok", slot: 0, record: { seq: 4 } });
  });

  it("единственная копия", () => {
    expect(chooseSave([null, older])).toMatchObject({ kind: "ok", slot: 1 });
  });

  it("обе испорчены", () => {
    expect(chooseSave(["мусор", older.slice(0, 20)])).toEqual({ kind: "corrupt" });
  });

  it("старый формат", () => {
    const json = older.slice(older.indexOf("\n") + 1).replace('"format":1', '"format":0');
    expect(chooseSave([withChecksumOf(json), null])).toEqual({ kind: "old" });
  });
});

describe("проверка повтором", () => {
  it("честная партия сходится", () => {
    expect(verifySave(play([MOVE, END, MOVE]))).toBe(true);
  });

  it("подменённое состояние не сходится", () => {
    const body = play([MOVE]);
    expect(verifySave({ ...body, state: { ...body.state, day: 3 } })).toBe(false);
  });

  it("сравнение данных не зависит от порядка полей", () => {
    expect(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameData([1, 2], [2, 1])).toBe(false);
  });
});

describe("дамп", () => {
  it("собирается и разбирается обратно", () => {
    const save = play([MOVE, END]);
    const text = buildDump({
      gameVersion: "abc",
      save,
      error: { message: "бух", stack: "at x" },
      device: DEVICE,
      createdAt: "2026-11-11T10:00:00.000Z",
    });
    expect(parseDump(text)).toMatchObject({
      ok: true,
      dump: {
        game: { initial: save.initial, commands: save.commands },
        state: save.state,
        error: { message: "бух" },
        versions: { game: "abc" },
      },
    });
    const raw = JSON.parse(text) as { journal: unknown[]; device: unknown };
    // Два шага героя, конец хода, начало дня.
    expect(raw.journal).toHaveLength(4);
    expect(raw.device).toEqual(DEVICE);
  });

  it("ошибка до создания партии: только версии, ошибка и устройство", () => {
    const text = buildDump({
      gameVersion: "abc",
      save: null,
      error: { message: "рано", stack: null },
      device: DEVICE,
      createdAt: "2026-11-11T10:00:00.000Z",
    });
    const parsed = parseDump(text);
    expect(parsed).toMatchObject({ ok: true, dump: { game: null, state: null } });
  });

  it("длинная партия: команды все, журнал — только последних команд", () => {
    const commands = Array.from({ length: DUMP_JOURNAL_COMMANDS + 50 }, () => END);
    const text = buildDump({
      gameVersion: "abc",
      save: play(commands),
      error: null,
      device: DEVICE,
      createdAt: "2026-11-11T10:00:00.000Z",
    });
    const raw = JSON.parse(text) as { journal: unknown[]; game: { commands: unknown[] } };
    expect(raw.game.commands).toHaveLength(DUMP_JOURNAL_COMMANDS + 50);
    // Конец хода даёт два события: ход закончен и день начался.
    expect(raw.journal).toHaveLength(DUMP_JOURNAL_COMMANDS * 2);
  });

  it("чужой файл не принимается", () => {
    expect(parseDump("{").ok).toBe(false);
    expect(parseDump('{"kind":"other"}').ok).toBe(false);
  });
});
