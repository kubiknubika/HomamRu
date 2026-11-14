// Осада на экране боя: docs/mechanics/51-siege-screen.md.
import { createBattle } from "@homamru/core";
import type { BattleState } from "@homamru/core";
import { CREATURES } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import { describeStack } from "./battleLog.ts";
import { createBattleSession } from "./battleSession.ts";
import {
  catapultLabel,
  cellLook,
  cellNote,
  openingLine,
  partCell,
  shotNote,
  TOWER_CELLS,
  towerMarks,
} from "./battleSiege.ts";
import { place, ready } from "./testkit.ts";
import { startTrialBattle } from "./trialBattle.ts";

type Kind = "fort" | "citadel" | "castle";

function siege(kind: Kind | null, attacker = "militia", buildings = 4): BattleState {
  const created = createBattle(
    {
      id: "s",
      name: "s",
      obstacles: kind === null ? [{ col: 5, row: 5 }] : [],
      attacker: { morale: 0, luck: 0, army: [{ creature: attacker, count: 400 }] },
      defender: { morale: 0, luck: 0, army: [{ creature: "militia", count: 20 }] },
      ...(kind === null ? {} : { siege: { fortification: kind, buildings } }),
    },
    CREATURES,
    1,
  );
  if (!created.ok) {
    throw new Error("бой не создан");
  }
  return created.state;
}

/** Та же осада, но с такой прочностью частей. */
function withHealth(state: BattleState, health: Record<string, number>): BattleState {
  const { siege: current } = state;
  if (current === null) {
    throw new Error("не осада");
  }
  return { ...state, siege: { ...current, health: { ...current.health, ...health } } };
}

const WHOLE = { wall1: 2, wall2: 2, wall3: 2, wall4: 2, gate: 2 };

describe("вид клеток", () => {
  it("без осады: трава и препятствия, башен нет, подсказок нет", () => {
    const state = siege(null);
    expect(cellLook(state, { col: 5, row: 5 })).toBe("obstacle");
    expect(cellLook(state, { col: 11, row: 0 })).toBe("field");
    expect(towerMarks(state)).toEqual([]);
    expect(cellNote(state, { col: 11, row: 0 })).toBeNull();
    expect(openingLine(state)).toBe("");
  });

  it("стена: вечная, целый участок, треснувший, пролом", () => {
    const state = withHealth(siege("fort"), WHOLE);
    expect(cellLook(state, { col: 11, row: 0 })).toBe("wall");
    expect(cellLook(state, { col: 9, row: 4 })).toBe("segment");
    expect(cellLook(withHealth(state, { wall2: 1 }), { col: 9, row: 4 })).toBe("cracked");
    expect(cellLook(withHealth(state, { wall2: 0 }), { col: 9, row: 4 })).toBe("field");
    // Стена замка прочнее: с прочностью 3 и 2 участок цел, с 1 — треснул.
    const castle = siege("castle");
    expect(cellLook(withHealth(castle, { wall1: 3 }), { col: 11, row: 1 })).toBe("segment");
    expect(cellLook(withHealth(castle, { wall1: 1 }), { col: 11, row: 1 })).toBe("cracked");
  });

  it("ворота: закрыты, открыты стоящим в них, разбиты", () => {
    const state = withHealth(siege("fort"), WHOLE);
    expect(cellLook(state, { col: 9, row: 5 })).toBe("gate");
    expect(cellLook(state, { col: 10, row: 5 })).toBe("gate");
    // Мост — обычная клетка.
    expect(cellLook(state, { col: 8, row: 5 })).toBe("field");
    const open = place(state, { b1: [10, 5] });
    expect(cellLook(open, { col: 9, row: 5 })).toBe("gateOpen");
    expect(cellLook(withHealth(state, { gate: 0 }), { col: 9, row: 5 })).toBe("field");
  });

  it("ров: есть у цитадели и замка, нет у форта и у моста", () => {
    expect(cellLook(siege("fort"), { col: 10, row: 0 })).toBe("field");
    expect(cellLook(siege("citadel"), { col: 10, row: 0 })).toBe("moat");
    expect(cellLook(siege("castle"), { col: 8, row: 4 })).toBe("moat");
    expect(cellLook(siege("citadel"), { col: 8, row: 5 })).toBe("field");
  });

  it("башни: форт — нет, цитадель — главная, замок — три; разрушенная пропадает", () => {
    expect(towerMarks(siege("fort"))).toEqual([]);
    expect(towerMarks(siege("citadel")).map((mark) => mark.tower)).toEqual(["keep"]);
    const castle = siege("castle");
    expect(towerMarks(castle).map((mark) => mark.tower)).toEqual([
      "keep",
      "upperTower",
      "lowerTower",
    ]);
    expect(towerMarks(withHealth(castle, { keep: 0 })).map((mark) => mark.tower)).toEqual([
      "upperTower",
      "lowerTower",
    ]);
  });

  it("башни нарисованы на клетках вечной стены, каждая на своей", () => {
    const state = siege("castle");
    const cells = Object.values(TOWER_CELLS);
    expect(new Set(cells.map((cell) => `${cell.col},${cell.row}`)).size).toBe(3);
    expect(cells.map((cell) => cellLook(state, cell))).toEqual(["wall", "wall", "wall"]);
  });

  it("куда летит снаряд катапульты: участок, створ ворот, клетка башни", () => {
    expect(partCell("wall3")).toEqual({ col: 10, row: 7 });
    expect(partCell("gate")).toEqual({ col: 10, row: 5 });
    expect(partCell("keep")).toEqual(TOWER_CELLS.keep);
    expect(catapultLabel(0)).toBe("не пробила");
    expect(catapultLabel(2)).toBe("−2");
  });
});

describe("подсказки осады", () => {
  it("удержание на клетке осады говорит, что это; на траве — ничего", () => {
    const state = withHealth(siege("castle"), { wall1: 3, wall2: 1, wall3: 0, gate: 2 });
    expect(cellNote(state, { col: 11, row: 1 })).toBe(
      "Стена, прочность 3. Ломает её только катапульта.",
    );
    expect(cellNote(state, { col: 9, row: 4 })).toContain("прочность 1");
    expect(cellNote(state, { col: 10, row: 7 })).toBe("Пролом: стена разрушена, проход свободен.");
    expect(cellNote(state, { col: 10, row: 3 })).toBe("Стена. Её не сломать.");
    expect(cellNote(state, { col: 9, row: 5 })).toContain("Ворота закрыты, прочность 2");
    expect(cellNote(withHealth(state, { gate: 0 }), { col: 10, row: 5 })).toBe(
      "Ворота разбиты: проход свободен.",
    );
    expect(cellNote(place(state, { b1: [9, 5] }), { col: 10, row: 5 })).toContain("Ворота открыты");
    expect(cellNote(state, { col: 10, row: 0 })).toBe(
      "Ров: вошедший теряет 70 здоровья, его ход кончается, защита меньше на 3.",
    );
    expect(cellNote(state, { col: 5, row: 5 })).toBeNull();
    expect(cellNote(state, { col: 8, row: 5 })).toBeNull();
  });

  it("башня: урон по числу зданий; разрушенная — просто стена", () => {
    const state = siege("castle", "militia", 4);
    expect(cellNote(state, TOWER_CELLS.keep)).toBe(
      "Главная башня: стреляет в начале раунда, урон 18–36, прочность 2.",
    );
    expect(cellNote(state, TOWER_CELLS.upperTower)).toContain("Верхняя башня");
    expect(cellNote(state, TOWER_CELLS.lowerTower)).toContain("урон 10–20");
    expect(cellNote(withHealth(state, { keep: 0 }), TOWER_CELLS.keep)).toBe(
      "Стена. Её не сломать.",
    );
    expect(cellNote(siege("fort"), TOWER_CELLS.keep)).toBe("Стена. Её не сломать.");
  });

  it("выстрел через стену помечен; через пролом на пути и изнутри — нет", () => {
    const state = place(withHealth(siege("fort", "slinger"), WHOLE), { a1: [3, 5] });
    const [me] = state.stacks;
    if (me === undefined) {
      throw new Error("нет отряда");
    }
    expect(shotNote(state, me, "b1")).toBe(" Через стену — урон вдвое меньше.");
    expect(shotNote(withHealth(state, { gate: 0 }), me, "b1")).toBe("");
    expect(shotNote(state, me, "нет такого")).toBe("");
    expect(shotNote(siege(null, "slinger"), me, "b1")).toBe("");
  });

  it("катапульта описана своими словами", () => {
    const state = siege("fort");
    const catapult = state.stacks.find((stack) => stack.id === "ac");
    expect(catapult === undefined ? "" : describeStack(state, catapult)).toMatch(
      /^Катапульта: здоровье 1000 из 1000, защита 10, выстрелов \d+\./,
    );
  });
});

describe("сессия боя в осаде", () => {
  it("первая строка журнала говорит, что башни и катапульта сделали до первого хода", () => {
    const calm = withHealth(siege("fort"), WHOLE);
    expect(openingLine(calm)).toBe("");
    const hurt = {
      ...withHealth(calm, { wall2: 1, wall4: 0 }),
      stacks: calm.stacks.map((stack) => (stack.id === "a1" ? { ...stack, count: 397 } : stack)),
    };
    expect(openingLine(hurt)).toBe(
      "До первого хода — башни: Ополченец, погибло 3; катапульта повредила участок стены 2; катапульта пробила участок стены 4.",
    );
    expect(createBattleSession(hurt).getSnapshot().log).toBe(openingLine(hurt));
    // Со второго раунда выстрелы приходят событиями: строки по состоянию нет.
    expect(openingLine({ ...hurt, round: 2 })).toBe("");
  });

  it("удержание на стене показывает подсказку, касание её убирает; отряд важнее клетки", () => {
    const session = ready(siege("citadel"));
    session.inspectCell({ col: 10, row: 0 });
    expect(session.getSnapshot().note).toContain("Ров");
    expect(session.getSnapshot().inspected).toBeNull();
    session.tapCell({ col: 5, row: 5 });
    expect(session.getSnapshot().note).toBeNull();
    session.inspectCell({ col: 0, row: 7 });
    expect(session.getSnapshot()).toMatchObject({ inspected: "ac", note: null });
    session.inspectCell({ col: 5, row: 5 });
    expect(session.getSnapshot()).toMatchObject({ inspected: "ac", note: null });
  });
});

describe("проверочная осада", () => {
  it("открывается из своего файла: замок с тремя башнями и рвом, игрок нападает", () => {
    const state = startTrialBattle(7, "siege");
    expect(towerMarks(state)).toHaveLength(3);
    expect(state.siege?.moat).toBe(true);
    expect(state.stacks.some((stack) => stack.id === "ac")).toBe(true);
    expect(state.sides[0].hero).not.toBeNull();
    // Обычный проверочный бой остался без стены.
    expect(startTrialBattle(7).siege).toBeNull();
  });
});
