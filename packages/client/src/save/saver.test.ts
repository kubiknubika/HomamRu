import { TEST_ARMY, CONTENT } from "@homamru/core/testkit";
import { createGame } from "@homamru/core";
import { chooseSave } from "@homamru/data";
import type { SaveBody, SaveSlot } from "@homamru/data";
import { describe, expect, it } from "vitest";
import { createSaver } from "./saver.ts";
import type { SaveStorage } from "./saveStorage.ts";

const DEFAULTS = { ...CONTENT, heroArmy: TEST_ARMY };

function bodyOnDay(day: number): SaveBody {
  const created = createGame(
    {
      id: "t",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [{ hero: { x: 1, y: 1, army: TEST_ARMY } }],
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error("карта не создалась");
  }
  // Для записи важно только, что состояния различаются.
  return {
    gameVersion: "test",
    initial: created.state,
    commands: [],
    state: { ...created.state, day },
  };
}

interface FakeStorage extends SaveStorage {
  readonly copies: [string | null, string | null];
  readonly writes: SaveSlot[];
  failing: boolean;
}

function fakeStorage(): FakeStorage {
  const fake: FakeStorage = {
    copies: [null, null],
    writes: [],
    failing: false,
    read: (slot) => Promise.resolve(fake.copies[slot]),
    write: async (slot, text) => {
      await Promise.resolve();
      fake.writes.push(slot);
      if (fake.failing) {
        // Оборванная запись: в копии остался обрывок.
        fake.copies[slot] = text.slice(0, 30);
        throw new Error("нет места");
      }
      fake.copies[slot] = text;
    },
  };
  return fake;
}

describe("запись сохранения", () => {
  it("копии чередуются, загружается самая свежая", async () => {
    const storage = fakeStorage();
    const saver = createSaver(storage, { seq: -1, slot: null }, () => {});
    for (const day of [1, 2, 3]) {
      saver.save(bodyOnDay(day));
      await saver.idle();
    }
    expect(storage.writes).toEqual([0, 1, 0]);
    expect(chooseSave(storage.copies, DEFAULTS)).toMatchObject({
      kind: "ok",
      slot: 0,
      record: { seq: 2, state: { day: 3 } },
    });
  });

  it("продолжает нумерацию и не трогает копию с последней записью", async () => {
    const storage = fakeStorage();
    const saver = createSaver(storage, { seq: 41, slot: 0 }, () => {});
    saver.save(bodyOnDay(5));
    await saver.idle();
    expect(storage.writes).toEqual([1]);
    expect(chooseSave(storage.copies, DEFAULTS)).toMatchObject({ kind: "ok", record: { seq: 42 } });
  });

  it("пока идёт запись, из очереди на диск попадает только последняя", async () => {
    const storage = fakeStorage();
    const saver = createSaver(storage, { seq: -1, slot: null }, () => {});
    saver.save(bodyOnDay(1));
    saver.save(bodyOnDay(2));
    saver.save(bodyOnDay(3));
    await saver.idle();
    expect(storage.writes).toHaveLength(2);
    expect(chooseSave(storage.copies, DEFAULTS)).toMatchObject({
      kind: "ok",
      record: { state: { day: 3 } },
    });
  });

  it("оборванная запись не портит предыдущую копию; предупреждение одно", async () => {
    const storage = fakeStorage();
    let warnings = 0;
    const saver = createSaver(storage, { seq: -1, slot: null }, () => {
      warnings += 1;
    });
    saver.save(bodyOnDay(1));
    await saver.idle();
    storage.failing = true;
    saver.save(bodyOnDay(2));
    await saver.idle();
    saver.save(bodyOnDay(3));
    await saver.idle();
    expect(warnings).toBe(1);
    // Обе неудачные записи шли во вторую копию; первая цела.
    expect(storage.writes).toEqual([0, 1, 1]);
    expect(chooseSave(storage.copies, DEFAULTS)).toMatchObject({
      kind: "ok",
      slot: 0,
      record: { state: { day: 1 } },
    });
    storage.failing = false;
    saver.save(bodyOnDay(4));
    await saver.idle();
    expect(chooseSave(storage.copies, DEFAULTS)).toMatchObject({
      kind: "ok",
      slot: 1,
      record: { state: { day: 4 } },
    });
  });
});
