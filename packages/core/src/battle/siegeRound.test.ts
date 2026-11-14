// Осада: башни, катапульта и компьютер — docs/mechanics/50-siege.md.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { AUTO_BATTLE_MAX_ROUNDS, randomSiege, runAutoBattle } from "./autobattle.ts";
import { replayBattle } from "./commands.ts";
import { createBattle } from "./create.ts";
import { catapultAims, siege, untilNextRound, withHealth } from "./siegeKit.ts";
import { act, army, CREATURES, stack, startBattle, turnOf, withStacks } from "./testkit.ts";
import type { BattleEvent } from "./types.ts";

function shots(events: readonly BattleEvent[], type: "towerShot" | "catapultShot") {
  return events.filter((event) => event.type === type);
}

describe("башни и катапульта", () => {
  it("в начале раунда стреляют башни, затем катапульта, затем ходят отряды", () => {
    const { events } = siege("castle", ["militia:40"]);
    const order = events.map((event) => event.type);
    expect(order.slice(0, 5)).toEqual([
      "roundStarted",
      "towerShot",
      "towerShot",
      "towerShot",
      "catapultShot",
    ]);
    expect(order.at(-1)).toBe("stackTurn");
  });

  it("у форта башен нет, у цитадели одна", () => {
    expect(shots(siege("fort").events, "towerShot")).toHaveLength(0);
    expect(shots(siege("citadel").events, "towerShot")).toHaveLength(1);
  });

  it("урон башни — от наименьшего до вдвое большего, защита цели не считается", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { events } = startBattle(
        army(["armsman:40"], { hero: { attack: 0, defense: 20 } }),
        army(["militia:1"]),
        { seed, siege: { fortification: "citadel", buildings: 3 } },
      );
      const [shot] = shots(events, "towerShot");
      expect(shot?.type === "towerShot" ? shot.damage : 0).toBeGreaterThanOrEqual(16);
      expect(shot?.type === "towerShot" ? shot.damage : 99).toBeLessThanOrEqual(32);
    }
  });

  it("башня выбирает того, кто сможет ударить или выстрелить на следующем ходу", () => {
    // Пращник стреляет, ополченец с края поля до врага не дойдёт.
    const { events } = siege("citadel", ["militia:40", "slinger:5"]);
    expect(shots(events, "towerShot")[0]).toMatchObject({ targetId: "a2" });
  });

  it("из тех, кто не может ни ударить, ни выстрелить, — того, по кому выстрел ценнее", () => {
    // Латник дороже ополченца: 300 против 60.
    const { events } = siege("citadel", ["militia:40", "armsman:40"]);
    expect(shots(events, "towerShot")[0]).toMatchObject({ targetId: "a2" });
  });

  it("разрушенная башня не стреляет", () => {
    const { state } = siege("citadel", ["militia:40"]);
    const seen = untilNextRound(withHealth(state, { keep: 0 }));
    expect(seen.some((event) => event.type === "roundStarted")).toBe(true);
    expect(shots(seen, "towerShot")).toHaveLength(0);
  });

  it("катапульта целит в участок стены; попав, убавляет прочность не больше чем на 2", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const { state, events } = startBattle(army(["militia:20"]), army(["militia:20"]), {
        seed,
        siege: { fortification: "fort", buildings: 0 },
      });
      const [shot] = shots(events, "catapultShot");
      if (shot?.type !== "catapultShot") {
        throw new Error("Катапульта не выстрелила.");
      }
      expect(shot.aimed.startsWith("wall")).toBe(true);
      expect(shot.hit.startsWith("wall")).toBe(true);
      expect([0, 1, 2]).toContain(shot.damage);
      expect(state.siege?.health[shot.hit]).toBe(2 - shot.damage);
      expect(stack(state, "ac").shots).toBe(23);
    }
  });

  it("когда участков не осталось, катапульта бьёт ворота, потом главную башню", () => {
    const walls = { wall1: 0, wall2: 0, wall3: 0, wall4: 0 };
    expect(catapultAims(walls)).toEqual(["gate"]);
    expect(catapultAims({ ...walls, gate: 0 })).toEqual(["keep"]);
    expect(catapultAims({ ...walls, gate: 0, keep: 0 })).toEqual([]);
  });

  it("катапульту можно разбить; разбитая не стреляет, а нападающий без существ проигрывает", () => {
    const { state } = siege("fort", ["militia:1"], ["falcon:40"]);
    const next = turnOf(withStacks(state, { b1: { col: 1, row: 7 } }), "b1");
    const hit = act(next, { type: "battleAttack", target: "ac", from: { col: 1, row: 7 } });
    // Катапульта не отвечает.
    expect(hit.events.filter((event) => event.type === "strike")).toHaveLength(1);
    const dead = withStacks(hit.state, { ac: { count: 0 } });
    const killed = act(turnOf(withStacks(dead, { b1: { col: 1, row: 5 } }), "b1"), {
      type: "battleAttack",
      target: "a1",
      from: { col: 1, row: 5 },
    });
    expect(killed.state.result).toMatchObject({ winner: 1, reason: "destroyed" });
  });
});

const SIEGES = 300;

describe("компьютер в осаде", () => {
  it("обороняющийся с башней за стену не выходит", () => {
    const { state } = siege("citadel", ["militia:20"], ["militia:20"]);
    const turn = turnOf(state, "b1");
    expect(chooseBattleCommand(turn)).toEqual({ type: "battleDefend", side: 1 });
  });

  it("обороняющийся без башен и стрелков выходит сам", () => {
    const { state } = siege("fort", ["militia:20"], ["militia:20"]);
    expect(chooseBattleCommand(turnOf(state, "b1"))?.type).toBe("battleMove");
  });

  it("пеший нападающий ждёт на месте, пока нет дороги внутрь, и идёт, когда она есть", () => {
    const { state } = siege("citadel", ["militia:20"], ["slinger:20"]);
    expect(chooseBattleCommand(turnOf(state, "a1"))).toEqual({ type: "battleDefend", side: 0 });
    const breached = withHealth(state, { gate: 0 });
    expect(chooseBattleCommand(turnOf(breached, "a1"))?.type).toBe("battleMove");
  });

  it("катапульту компьютер бьёт, только когда больше ударить некого", () => {
    const { state } = siege("fort", ["militia:1"], ["falcon:40", "militia:5"]);
    // Обороняющийся без башен и стрелков стену не держит. Сокол достаёт и ополченца, и катапульту.
    const near = turnOf(
      withStacks(state, { b1: { col: 1, row: 6 }, a1: { col: 1, row: 5 } }),
      "b1",
    );
    expect(chooseBattleCommand(near)).toMatchObject({ type: "battleAttack", target: "a1" });
    // Ополченец далеко и за стеной не достать, катапульта рядом.
    const far = turnOf(
      withStacks(state, {
        b1: { col: 1, row: 8 },
        a1: { col: 13, row: 0 },
        b2: { col: 14, row: 10 },
      }),
      "b1",
    );
    expect(chooseBattleCommand(far)).toMatchObject({ type: "battleAttack", target: "ac" });
  });

  it("башня стреляет по катапульте, только когда других целей нет", () => {
    const { state } = siege("citadel", ["militia:400"], ["militia:5"]);
    const shot = untilNextRound(state).find((event) => event.type === "towerShot");
    expect(shot).toMatchObject({ targetId: "a1" });
  });

  it("осада встала — нападающий бежит: катапульта разбита, пешие за стену не попадут", () => {
    const led = army(["militia:400"], { hero: { attack: 0, defense: 0 } });
    const { state } = startBattle(led, army(["militia:5"]), {
      siege: { fortification: "citadel", buildings: 0 },
    });
    const mine = turnOf(state, "a1");
    expect(chooseBattleCommand(mine)).toEqual({ type: "battleDefend", side: 0 });
    const lost = withStacks(mine, { ac: { count: 0 } });
    expect(chooseBattleCommand(lost)).toEqual({ type: "battleFlee", side: 0 });
    expect(chooseBattleCommand(withStacks(mine, { ac: { shots: 0 } }))?.type).toBe("battleFlee");
    // Есть пролом — дорога есть, бежать незачем.
    expect(chooseBattleCommand(withHealth(lost, { gate: 0 }))?.type).toBe("battleMove");
    // Без героя бежать некому.
    const alone = siege("citadel", ["militia:400"], ["militia:5"]).state;
    expect(chooseBattleCommand(withStacks(turnOf(alone, "a1"), { ac: { count: 0 } }))?.type).toBe(
      "battleDefend",
    );
  });

  it("с летающими или стрелками нападающий без катапульты не бежит", () => {
    const hero = { hero: { attack: 0, defense: 0 } };
    const citadel = { siege: { fortification: "citadel", buildings: 0 } } as const;
    const flying = startBattle(
      army(["militia:40", "falcon:5"], hero),
      army(["militia:5"]),
      citadel,
    ).state;
    const gone = withStacks(turnOf(flying, "a1"), { ac: { count: 0 } });
    expect(chooseBattleCommand(gone)).toEqual({ type: "battleDefend", side: 0 });
    const shooting = startBattle(
      army(["militia:40", "slinger:5"], hero),
      army(["militia:5"]),
      citadel,
    ).state;
    const still = withStacks(turnOf(shooting, "a1"), { ac: { count: 0 } });
    expect(chooseBattleCommand(still)).toEqual({ type: "battleDefend", side: 0 });
  });

  it(`${SIEGES} осад двух компьютеров: заканчиваются, свойства не нарушены, побеждают обе стороны, повтор сходится`, () => {
    const failed: string[] = [];
    const wins = [0, 0];
    let longest = 0;
    for (let seed = 1; seed <= SIEGES; seed += 1) {
      const definition = randomSiege(seed, CREATURES);
      const run = runAutoBattle(definition, CREATURES, seed);
      const winner = run.state?.result?.winner;
      if (run.problems.length > 0 || winner === undefined) {
        failed.push(`сид ${seed}: ${run.problems.join("; ") || "нет итога"}`);
        continue;
      }
      wins[winner] = (wins[winner] ?? 0) + 1;
      longest = Math.max(longest, run.state?.round ?? 0);
      if (seed % 20 === 0) {
        const created = createBattle(definition, CREATURES, seed);
        const replayed = created.ok ? replayBattle(created.state, run.commands) : undefined;
        if (replayed?.ok !== true || JSON.stringify(replayed.state) !== JSON.stringify(run.state)) {
          failed.push(`сид ${seed}: повтор разошёлся`);
        }
      }
    }
    expect(failed).toEqual([]);
    expect(longest).toBeLessThanOrEqual(AUTO_BATTLE_MAX_ROUNDS);
    expect(wins[0]).toBeGreaterThan(SIEGES / 10);
    expect(wins[1]).toBeGreaterThan(SIEGES / 10);
  }, 120_000);
});
