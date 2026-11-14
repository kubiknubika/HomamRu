// Осада: docs/mechanics/50-siege.md.
import { describe, expect, it } from "vitest";
import { renderBattle } from "./render.ts";
import { createBattle } from "./create.ts";
import { damageRange, defenseOf } from "./damage.ts";
import { createSiege, gateOpen, hasWallPenalty, isMachine, WALL_PARTS } from "./siege.ts";
import { canReach, healthOf, siege, withHealth } from "./siegeKit.ts";
import { act, army, code, CREATURES, stack, startBattle, turnOf, withStacks } from "./testkit.ts";

describe("текстовый вывод осады", () => {
  it("стена «=», ров «~», ворота «|»; разбитые ворота и пролом — обычные клетки", () => {
    const { state } = siege("citadel");
    const whole = withHealth(state, { wall1: 2, wall2: 2, wall3: 2, wall4: 2, gate: 2 });
    const rows = (shown: typeof state): string[] => renderBattle(shown).split("\n").slice(3, 14);
    expect(rows(whole)[0]).toMatch(/~ {2}= {2}\. {2}\. {2}b?/);
    expect(rows(whole)[5]).toContain(".  |  |  .");
    expect(rows(withHealth(whole, { gate: 0 }))[5]).not.toContain("|");
    expect(rows(whole)[4]).toContain("~  =");
    expect(rows(withHealth(whole, { wall2: 0 }))[4]).toContain("~  .");
    expect(renderBattle(startBattle(army(["militia:1"]), army(["militia:1"])).state)).not.toMatch(
      /[=~|]/,
    );
  });
});

describe("что даёт укрепление", () => {
  it.each([
    ["fort", [2, 2, 2, 2, 2, 0, 0, 0], false],
    ["citadel", [2, 2, 2, 2, 2, 2, 0, 0], true],
    ["castle", [3, 3, 3, 3, 2, 2, 2, 2], true],
  ] as const)("%s: прочность частей и ров", (fortification, health, moat) => {
    const created = createSiege(fortification, 0);
    expect(WALL_PARTS.map((part) => created.health[part])).toEqual(health);
    expect(created.moat).toBe(moat);
  });

  it.each([
    [0, 10, 6],
    [3, 16, 8],
    [7, 24, 12],
  ])("зданий %i: наименьший урон главной башни %i, малой %i", (buildings, keep, tower) => {
    const created = createSiege("castle", buildings);
    expect([created.keepDamage, created.towerDamage]).toEqual([keep, tower]);
  });

  it("без осады нет ни стены, ни катапульты", () => {
    const { state } = startBattle(army(["militia:20"]), army(["militia:20"]));
    expect(state.siege).toBeNull();
    expect(state.stacks.some(isMachine)).toBe(false);
  });

  it("в осаде у нападающего катапульта: стоит в (0, 7) и в очереди ходов не участвует", () => {
    const { state } = siege("fort");
    const catapult = stack(state, "ac");
    expect([catapult.col, catapult.row, catapult.turn]).toEqual([0, 7, "done"]);
    expect(state.activeStack).not.toBe("ac");
  });

  it("препятствия на поле осады — ошибка описания", () => {
    const created = createBattle(
      {
        id: "x",
        name: "x",
        obstacles: [{ col: 5, row: 5 }],
        siege: { fortification: "fort", buildings: 0 },
        attacker: army(["militia:1"]),
        defender: army(["militia:1"]),
      },
      CREATURES,
      1,
    );
    expect(created.ok).toBe(false);
  });
});

describe("стена и ворота", () => {
  it("пеший нападающий не проходит ни стену, ни закрытые ворота", () => {
    const { state } = siege("fort");
    const near = turnOf(withStacks(state, { a1: { col: 8, row: 5 } }), "a1");
    expect(canReach(near, "a1", { col: 9, row: 5 })).toBe(false);
    expect(canReach(near, "a1", { col: 9, row: 4 })).toBe(false);
    expect(canReach(near, "a1", { col: 10, row: 4 })).toBe(false);
  });

  it("в пролом пеший проходит", () => {
    const { state } = siege("fort");
    const near = turnOf(
      withStacks(withHealth(state, { wall2: 0 }), { a1: { col: 8, row: 4 } }),
      "a1",
    );
    expect(canReach(near, "a1", { col: 9, row: 4 })).toBe(true);
    expect(canReach(near, "a1", { col: 10, row: 4 })).toBe(true);
  });

  it("в разбитые ворота проходит любой", () => {
    const { state } = siege("fort");
    const near = turnOf(
      withStacks(withHealth(state, { gate: 0 }), { a1: { col: 8, row: 5 } }),
      "a1",
    );
    expect(canReach(near, "a1", { col: 10, row: 5 })).toBe(true);
  });

  it("летающий перелетает стену, но на неё не садится", () => {
    const { state } = siege("fort", ["falcon:5"]);
    const near = turnOf(withStacks(state, { a1: { col: 8, row: 3 } }), "a1");
    expect(canReach(near, "a1", { col: 11, row: 3 })).toBe(true);
    expect(canReach(near, "a1", { col: 10, row: 3 })).toBe(false);
    expect(canReach(near, "a1", { col: 9, row: 5 })).toBe(false);
  });

  it("обороняющийся выходит через ворота; пока он на створе, ворота открыты и для врага", () => {
    const { state } = siege("fort");
    const inside = turnOf(withStacks(state, { b1: { col: 11, row: 5 } }), "b1");
    expect(canReach(inside, "b1", { col: 8, row: 5 })).toBe(true);
    const onGate = withStacks(state, { b1: { col: 10, row: 5 }, a1: { col: 8, row: 5 } });
    expect(gateOpen(onGate.siege ?? createSiege("fort", 0), onGate.stacks)).toBe(true);
    expect(canReach(turnOf(onGate, "a1"), "a1", { col: 9, row: 5 })).toBe(true);
  });

  it("отряд на мосту не даёт открыть ворота", () => {
    const { state } = siege("fort");
    const blocked = withStacks(state, { b1: { col: 11, row: 5 }, a1: { col: 8, row: 5 } });
    expect(canReach(turnOf(blocked, "b1"), "b1", { col: 10, row: 5 })).toBe(false);
  });

  it("встать на стену нельзя: команда отклоняется", () => {
    const { state } = siege("fort", ["falcon:5"]);
    const near = turnOf(withStacks(state, { a1: { col: 8, row: 3 } }), "a1");
    expect(code(near, { type: "battleMove", side: 0, to: { col: 10, row: 3 } })).toBe(
      "CELL_UNREACHABLE",
    );
  });
});

describe("ров", () => {
  it("у форта рва нет, у цитадели есть", () => {
    const fort = turnOf(withStacks(siege("fort").state, { a1: { col: 6, row: 4 } }), "a1");
    const moved = act(fort, { type: "battleMove", to: { col: 8, row: 4 } });
    expect(moved.events.some((event) => event.type === "moatDamage")).toBe(false);
  });

  it("вошедший в ров останавливается, получает 70 урона, защита меньше на 3", () => {
    const { state } = siege("citadel");
    const near = turnOf(withStacks(state, { a1: { col: 6, row: 4 } }), "a1");
    // За рвом — участок стены; в сторону по рву дальше не пройти.
    expect(canReach(near, "a1", { col: 8, row: 4 })).toBe(true);
    const before = defenseOf(near, stack(near, "a1"));
    const moved = act(near, { type: "battleMove", to: { col: 8, row: 4 } });
    const hit = moved.events.find((event) => event.type === "moatDamage");
    expect(hit).toMatchObject({ damage: 70 });
    expect(healthOf(near, "a1") - healthOf(moved.state, "a1")).toBe(70);
    expect(defenseOf(moved.state, stack(moved.state, "a1"))).toBe(before - 3);
  });

  it("через ров за один ход не пройти даже в пролом", () => {
    const { state } = siege("citadel");
    const near = turnOf(
      withStacks(withHealth(state, { wall2: 0 }), { a1: { col: 7, row: 4 } }),
      "a1",
    );
    expect(canReach(near, "a1", { col: 8, row: 4 })).toBe(true);
    expect(canReach(near, "a1", { col: 9, row: 4 })).toBe(false);
    const inMoat = turnOf(withStacks(near, { a1: { col: 8, row: 4 } }), "a1");
    expect(canReach(inMoat, "a1", { col: 9, row: 4 })).toBe(true);
  });

  it("ров действует и на обороняющегося", () => {
    const { state } = siege("citadel");
    const out = turnOf(withStacks(state, { b1: { col: 7, row: 4 } }), "b1");
    const moved = act(out, { type: "battleMove", to: { col: 8, row: 4 } });
    expect(moved.events.some((event) => event.type === "moatDamage")).toBe(true);
  });

  it("летающий над рвом пролетает без вреда, севший в ров получает урон", () => {
    const { state } = siege("citadel", ["falcon:10"]);
    const near = turnOf(withStacks(state, { a1: { col: 6, row: 4 } }), "a1");
    const over = act(near, { type: "battleMove", to: { col: 11, row: 4 } });
    expect(over.events.some((event) => event.type === "moatDamage")).toBe(false);
    const into = act(near, { type: "battleMove", to: { col: 8, row: 4 } });
    expect(into.events.some((event) => event.type === "moatDamage")).toBe(true);
  });

  it("на мосту рва нет", () => {
    const { state } = siege("citadel");
    const near = turnOf(withStacks(state, { a1: { col: 6, row: 5 } }), "a1");
    const moved = act(near, { type: "battleMove", to: { col: 8, row: 5 } });
    expect(moved.events.some((event) => event.type === "moatDamage")).toBe(false);
  });
});

describe("стрельба через стену", () => {
  const fort = createSiege("fort", 0);

  it.each([
    [{ col: 5, row: 3 }, { col: 14, row: 3 }, true, "через вечную стену"],
    [{ col: 5, row: 4 }, { col: 14, row: 4 }, true, "через целый участок"],
    [{ col: 5, row: 5 }, { col: 14, row: 5 }, true, "через целые ворота"],
    [{ col: 5, row: 3 }, { col: 8, row: 3 }, false, "цель снаружи"],
    [{ col: 12, row: 3 }, { col: 14, row: 3 }, false, "стрелок внутри"],
    [{ col: 14, row: 3 }, { col: 5, row: 3 }, false, "обороняющийся стреляет изнутри"],
  ])("%o → %o: убавка %s (%s)", (from, to, penalty) => {
    expect(hasWallPenalty(fort, from, to)).toBe(penalty);
  });

  it("через пролом и разбитые ворота убавки нет", () => {
    const broken = { ...fort, health: { ...fort.health, wall2: 0, gate: 0 } };
    expect(hasWallPenalty(broken, { col: 5, row: 4 }, { col: 14, row: 4 })).toBe(false);
    expect(hasWallPenalty(broken, { col: 5, row: 5 }, { col: 14, row: 5 })).toBe(false);
  });

  it("вне осады убавки нет", () => {
    expect(hasWallPenalty(null, { col: 5, row: 3 }, { col: 14, row: 3 })).toBe(false);
  });

  it("урон выстрела через стену вдвое меньше", () => {
    const { state } = siege("fort", ["slinger:20"], ["falcon:5"]);
    const close = withStacks(state, { a1: { col: 6, row: 3 }, b1: { col: 12, row: 3 } });
    const open = { ...close, siege: null };
    const through = damageRange(close, stack(close, "a1"), stack(close, "b1"), "shot");
    const free = damageRange(open, stack(open, "a1"), stack(open, "b1"), "shot");
    expect(through).toEqual({ min: free.min / 2, max: free.max / 2 });
  });
});
