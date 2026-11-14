// Осада: когда нападающий компьютер бежит, и сравнение тактик — docs/mechanics/50-siege.md.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand, SIEGE_TACTICS } from "./ai.ts";
import type { SiegeTactics } from "./ai.ts";
import { AUTO_BATTLE_MAX_ROUNDS, randomSiege, runAutoBattle } from "./autobattle.ts";
import { applyBattleCommand } from "./commands.ts";
import { activeStackOf } from "./queries.ts";
import type { Fortification } from "./siege.ts";
import { withHealth } from "./siegeKit.ts";
import { act, army, CREATURES, startBattle, turnOf, withStacks } from "./testkit.ts";
import type { BattleState } from "./types.ts";

const HERO = { hero: { attack: 0, defense: 0 } };
const FLEE = { type: "battleFlee", side: 0 };

/** Осада, в которой у нападающего есть герой, а катапульта уже разбита; ход первого отряда. */
function stalled(
  attacker: readonly string[],
  defender: readonly string[] = ["militia:5"],
  fortification: Fortification = "citadel",
): BattleState {
  const { state } = startBattle(army(attacker, HERO), army(defender), {
    siege: { fortification, buildings: 0 },
  });
  // Первый выстрел катапульты уже был: стена и ворота возвращены целыми.
  const whole = withHealth(state, { wall1: 2, wall2: 2, wall3: 2, wall4: 2, gate: 2 });
  return turnOf(withStacks(whole, { ac: { count: 0 } }), "a1");
}

function chosen(state: BattleState): string | undefined {
  return chooseBattleCommand(state)?.type;
}

/** Доигрывает бой компьютером за обе стороны; возвращает итог и число раундов. */
function playOut(initial: BattleState): BattleState {
  let state = initial;
  while (state.result === null && state.round <= AUTO_BATTLE_MAX_ROUNDS) {
    const command = chooseBattleCommand(state);
    if (command === undefined) {
      break;
    }
    const result = applyBattleCommand(state, command);
    if (!result.ok) {
      throw new Error(`Команда ${command.type} отклонена: ${result.code}`);
    }
    ({ state } = result);
  }
  return state;
}

describe("когда нападающий компьютер бежит", () => {
  it("катапульта: с последним выстрелом ещё не бежит, без выстрелов бежит, разбитая — бежит", () => {
    const state = withStacks(stalled(["militia:400"]), { ac: { count: 1, shots: 1 } });
    expect(chosen(state)).toBe("battleDefend");
    expect(chosen(withStacks(state, { ac: { shots: 0 } }))).toBe("battleFlee");
    expect(chosen(withStacks(state, { ac: { count: 0, shots: 24 } }))).toBe("battleFlee");
  });

  it("летающий: пока жив хоть один — не бежит; погиб — бежит", () => {
    const state = stalled(["militia:400", "falcon:1"]);
    expect(chosen(state)).toBe("battleDefend");
    expect(chosen(turnOf(state, "a2"))).not.toBe("battleFlee");
    expect(chosen(withStacks(state, { a2: { count: 0 } }))).toBe("battleFlee");
  });

  it("стрелок: с последним выстрелом не бежит, без выстрелов бежит", () => {
    const state = stalled(["militia:400", "slinger:5"]);
    expect(chosen(withStacks(state, { a2: { shots: 1 } }))).toBe("battleDefend");
    expect(chosen(turnOf(withStacks(state, { a2: { shots: 1 } }), "a2"))).toBe("battleShoot");
    expect(chosen(withStacks(state, { a2: { shots: 0 } }))).toBe("battleFlee");
    // Бежит на ходу любого своего отряда, в том числе самого стрелка без выстрелов.
    expect(chosen(turnOf(withStacks(state, { a2: { shots: 0 } }), "a2"))).toBe("battleFlee");
  });

  it.each(["wall1", "wall2", "wall3", "wall4", "gate"] as const)(
    "дорога через %s: прочность 1 — бежит, прочность 0 — идёт",
    (part) => {
      const state = stalled(["militia:400"]);
      expect(chosen(withHealth(state, { [part]: 1 }))).toBe("battleFlee");
      expect(chosen(withHealth(state, { [part]: 0 }))).toBe("battleMove");
    },
  );

  it("разрушенная башня дороги не даёт", () => {
    const state = stalled(["militia:400"], ["militia:5"], "castle");
    expect(chosen(withHealth(state, { keep: 0, upperTower: 0, lowerTower: 0 }))).toBe("battleFlee");
  });

  it("враг снаружи стены — до него дорога есть, не бежит", () => {
    const state = withStacks(stalled(["militia:400"]), { b1: { col: 5, row: 5 } });
    expect(chosen(state)).not.toBe("battleFlee");
  });

  it("враг в воротах держит их открытыми — дорога есть, не бежит", () => {
    const inGate = withStacks(stalled(["militia:400"]), { b1: { col: 10, row: 5 } });
    expect(chosen(inGate)).not.toBe("battleFlee");
    // Тот же враг на клетку глубже: ворота закрыты.
    expect(chosen(withStacks(inGate, { b1: { col: 11, row: 5 } }))).toBe("battleFlee");
  });

  it("свой пеший отряд уже внутри стен — не бежит", () => {
    const state = withStacks(stalled(["militia:400", "militia:10"]), { a2: { col: 12, row: 5 } });
    expect(chosen(state)).not.toBe("battleFlee");
    expect(chosen(withStacks(state, { a2: { count: 0 } }))).toBe("battleFlee");
  });

  it("один отряд за стеной не может дойти, другой может — не бежит никто", () => {
    const state = withHealth(stalled(["militia:400", "armsman:10"]), { wall4: 0 });
    expect(chosen(state)).toBe("battleMove");
    expect(chosen(turnOf(state, "a2"))).toBe("battleMove");
  });

  it("в форте без рва и башен правило то же", () => {
    expect(chosen(stalled(["militia:400"], ["slinger:5"], "fort"))).toBe("battleFlee");
    expect(chosen(stalled(["militia:400"], ["militia:5"], "fort"))).toBe("battleFlee");
  });

  it("без героя бежать некому: отряд защищается", () => {
    const { state } = startBattle(army(["militia:400"]), army(["militia:5"]), {
      siege: { fortification: "citadel", buildings: 0 },
    });
    expect(chosen(turnOf(withStacks(state, { ac: { count: 0 } }), "a1"))).toBe("battleDefend");
  });

  it("обороняющийся не бежит никогда, и вне осады не бежит никто", () => {
    const state = stalled(["militia:400"]);
    expect(chosen(turnOf(state, "b1"))).toBe("battleDefend");
    const open = startBattle(army(["militia:1"], HERO), army(["militia:400"], HERO)).state;
    expect(chosen(turnOf(open, "a1"))).not.toBe("battleFlee");
    expect(chosen(turnOf(open, "b1"))).not.toBe("battleFlee");
  });

  it("пока катапульта цела и стреляет, не бежит даже под башнями без шансов", () => {
    const state = withStacks(stalled(["militia:20"], ["slinger:400"], "castle"), {
      ac: { count: 1, shots: 24 },
    });
    expect(chosen(state)).toBe("battleDefend");
  });

  it("бегство принимается: бой окончен, победил обороняющийся", () => {
    const state = stalled(["militia:400"]);
    expect(chooseBattleCommand(state)).toEqual(FLEE);
    const after = act(state, { type: "battleFlee" });
    expect(after.state.result).toMatchObject({ winner: 1, reason: "fled" });
    expect(after.events).toContainEqual({ type: "sideFled", side: 0 });
  });

  it("катапульту разбили посреди боя: бой доигрывается бегством, а не стоит", () => {
    // Стена замка (прочность 3) первый выстрел катапульты переживает всегда.
    const { state } = startBattle(army(["militia:400"], HERO), army(["militia:5"]), {
      siege: { fortification: "castle", buildings: 0 },
    });
    const done = playOut(withStacks(state, { ac: { count: 0 } }));
    expect(done.result).toMatchObject({ winner: 1, reason: "fled" });
    expect(done.round).toBe(1);
  });

  it("катапульта отстрелялась, не пробив стену: нападающий бежит в том же раунде", () => {
    const { state } = startBattle(army(["militia:400"], HERO), army(["militia:5"]), {
      siege: { fortification: "castle", buildings: 0 },
    });
    const done = playOut(withStacks(state, { ac: { shots: 0 } }));
    expect(done.result).toMatchObject({ winner: 1, reason: "fled" });
  });

  it("без героя и без катапульты под башнями бой всё равно кончается: башни выбивают", () => {
    const { state } = startBattle(army(["militia:30"]), army(["militia:5"]), {
      siege: { fortification: "castle", buildings: 7 },
    });
    const done = playOut(withStacks(state, { ac: { count: 0 } }));
    expect(done.result).toMatchObject({ winner: 1, reason: "destroyed" });
  });

  it("без героя и без катапульты у форта: обороняющийся без стрелков выходит сам", () => {
    const { state } = startBattle(army(["militia:30"]), army(["militia:5"]), {
      siege: { fortification: "fort", buildings: 0 },
    });
    const done = playOut(withStacks(state, { ac: { count: 0 } }));
    expect(done.result).toMatchObject({ winner: 0, reason: "destroyed" });
  });
});

const TACTICS: readonly (readonly [string, Partial<SiegeTactics>])[] = [
  ["за стену не выходит никогда", { sortie: "never" }],
  ["не выходит и подходит к пролому", { sortie: "never", closeUp: true }],
  ["выходит без башен и стрелков (в игре)", {}],
  ["то же и подходит к пролому", { closeUp: true }],
  ["выходит ещё и под обстрелом без ответа", { sortie: "outshot" }],
  ["выходит всегда", { sortie: "always" }],
  ["летающие нападающего ждут пролома", { flyersWait: true }],
];
const PER_TACTIC = 60;

describe("тактики осады", () => {
  it.each(TACTICS)(
    "«%s»: осады кончаются, свойства не нарушены",
    (_name, change) => {
      const tactics = { ...SIEGE_TACTICS, ...change };
      const failed: string[] = [];
      for (let seed = 1; seed <= PER_TACTIC; seed += 1) {
        const run = runAutoBattle(randomSiege(seed, CREATURES), CREATURES, seed, (state) =>
          chooseBattleCommand(state, tactics),
        );
        if (run.problems.length > 0 || (run.state?.result ?? null) === null) {
          failed.push(`сид ${seed}: ${run.problems.join("; ") || "нет итога"}`);
        }
      }
      expect(failed).toEqual([]);
    },
    60_000,
  );

  it("без катапульты с самого начала: 200 осад кончаются при любой тактике обороны", () => {
    const failed: string[] = [];
    for (const sortie of ["never", "noRanged", "outshot", "always"] as const) {
      for (let seed = 1; seed <= 50; seed += 1) {
        const definition = randomSiege(seed, CREATURES);
        const led = { ...definition, attacker: { ...definition.attacker, ...HERO } };
        const { state } = startBattle(led.attacker, led.defender, { seed, siege: led.siege });
        let current = withStacks(state, { ac: { count: 0 } });
        while (current.result === null && current.round <= AUTO_BATTLE_MAX_ROUNDS) {
          const command = chooseBattleCommand(current, { ...SIEGE_TACTICS, sortie });
          const result = command === undefined ? undefined : applyBattleCommand(current, command);
          if (result?.ok !== true) {
            break;
          }
          current = result.state;
        }
        if (current.result === null) {
          failed.push(
            `${sortie}, сид ${seed}: раунд ${current.round}, ход ${activeStackOf(current)?.id}`,
          );
        }
      }
    }
    expect(failed).toEqual([]);
  }, 60_000);
});
