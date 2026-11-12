// Правила и свойства из docs/mechanics/23-map-battle.md.
import { describe, expect, it } from "vitest";
import { guardBattleCommand, playBattleOut } from "./battleAuto.ts";
import { applyCommand, replay } from "./commands.ts";
import { formatEvent } from "./render.ts";
import { gameWith, OPEN_FIELD, placeHero } from "./testkit.ts";
import type { Command, GameState, MapObjectDefinition } from "./types.ts";

const TO_ZONE: Command = { type: "moveHero", player: 0, heroId: "A", path: ["E", "E", "E"] };
const END: Command = { type: "endTurn", player: 0 };

function guard(count: number, creature = "militia"): MapObjectDefinition {
  return { type: "guard", x: 4, y: 0, creature, count };
}

/** Партия, где герой с данной армией уже вошёл в зону охранника и бой начался. */
function inBattle(army: string[], guardCount: number, seed = 1, extra: MapObjectDefinition[] = []) {
  const initial = gameWith(OPEN_FIELD, [guard(guardCount), ...extra], {
    army,
    attack: 2,
    defense: 1,
    seed,
  });
  const result = applyCommand(initial, TO_ZONE);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return { initial, state: result.state, events: result.events };
}

describe("начало боя", () => {
  it("нападающий — герой с его армией и характеристиками, обороняющийся — охранник одним отрядом", () => {
    const { state } = inBattle(["militia:20", "slinger:10", "falcon:5"], 15);
    const battle = state.battle?.state;
    expect(battle?.sides).toEqual([
      { hero: { attack: 2, defense: 1 }, morale: 1, luck: 0 },
      { hero: null, morale: 1, luck: 0 },
    ]);
    expect(battle?.stacks.map((stack) => [stack.id, stack.creature.id, stack.count])).toEqual([
      ["a1", "militia", 20],
      ["a2", "slinger", 10],
      ["a3", "falcon", 5],
      ["b1", "militia", 15],
    ]);
  });

  it("препятствий от 0 до 6, в столбцах 2–12, без повторов; число их бывает разным", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 150; seed += 1) {
      const obstacles = inBattle(["militia:20"], 15, seed).state.battle?.state.obstacles ?? [];
      counts.add(obstacles.length);
      expect(new Set(obstacles.map((cell) => `${cell.col},${cell.row}`)).size).toBe(
        obstacles.length,
      );
      for (const cell of obstacles) {
        expect(cell.col).toBeGreaterThanOrEqual(2);
        expect(cell.col).toBeLessThanOrEqual(12);
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThanOrEqual(10);
      }
    }
    expect([...counts].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("один сид — один и тот же бой; разные сиды — разные", () => {
    expect(inBattle(["militia:20"], 15, 7).state).toEqual(inBattle(["militia:20"], 15, 7).state);
    expect(inBattle(["militia:20"], 15, 7).state.battle).not.toEqual(
      inBattle(["militia:20"], 15, 8).state.battle,
    );
  });
});

describe("команды во время боя и без него", () => {
  it("пока идёт бой, команды карты отклоняются и ничего не меняют", () => {
    const { state } = inBattle(["militia:20"], 15);
    expect(applyCommand(state, END)).toMatchObject({ ok: false, code: "BATTLE_IN_PROGRESS" });
    expect(applyCommand(state, TO_ZONE)).toMatchObject({ ok: false, code: "BATTLE_IN_PROGRESS" });
  });

  it("когда боя нет, команды боя отклоняются", () => {
    const state = gameWith(OPEN_FIELD, [guard(15)]);
    expect(applyCommand(state, { type: "battleWait", side: 0 })).toMatchObject({
      ok: false,
      code: "NO_BATTLE",
    });
  });

  it("отказ команды боя — с кодом боя; охранник бежать не может", () => {
    const { state } = inBattle(["militia:20"], 15);
    expect(applyCommand(state, { type: "battleShoot", side: 0, target: "b1" })).toMatchObject({
      ok: false,
      code: "NOT_A_SHOOTER",
    });
    // Ополченцы равны по скорости, первым ходит нападающий; ждём — ход переходит охраннику.
    const waited = applyCommand(state, { type: "battleWait", side: 0 });
    const next = waited.ok ? waited.state : state;
    expect(applyCommand(next, { type: "battleFlee", side: 1 })).toMatchObject({ code: "NO_HERO" });
  });

  it("команда компьютера за охранника есть только в его ход", () => {
    const { state } = inBattle(["militia:20"], 15);
    expect(guardBattleCommand(state)).toBeUndefined();
    const waited = applyCommand(state, { type: "battleWait", side: 0 });
    const next = waited.ok ? waited.state : state;
    expect(guardBattleCommand(next)).toMatchObject({ side: 1 });
    // Охранник ходит сам, пока ход не вернётся герою.
    const after = playBattleOut(next, true);
    expect(after.commands.length).toBeGreaterThan(0);
    expect(after.state.battle?.state.activeStack).toMatch(/^a/);
    expect(guardBattleCommand(gameWith(OPEN_FIELD, []))).toBeUndefined();
  });
});

describe("конец боя", () => {
  it("победа: охранника нет, в армии выжившие, опыт — здоровье × убитые", () => {
    const { state } = inBattle(["falcon:30", "militia:1"], 5);
    const before = state.heroes[0];
    const { state: after, events } = playBattleOut(state);
    expect(after.battle).toBeNull();
    expect(after.outcome).toBeNull();
    expect(after.objects).toEqual([]);
    // Герой стоит там же, остаток хода прежний; 5 ополченцев × 12 здоровья = 60 опыта.
    expect(after.heroes[0]).toMatchObject({
      x: before?.x,
      y: before?.y,
      movement: before?.movement,
      experience: 60,
      level: 1,
    });
    const tail = events.filter((event) => event.type !== "battle").map(formatEvent);
    expect(tail[0]).toMatch(
      /^Бой окончен: победа героя; потери героя: falcon −\d+, militia −\d+; потери обороняющегося: 5$/,
    );
    expect(tail.slice(1)).toEqual(["Охранник o1 побеждён", "Герой A получил опыт: +60, всего 60"]);
  });

  it("после боя существ в каждом отряде не больше, чем было; пустые отряды убраны", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { state } = inBattle(["militia:12", "slinger:6", "militia:1"], 14, seed);
      const before = state.heroes[0]?.army ?? [];
      const { state: after, events } = playBattleOut(state);
      const finished = events.find((event) => event.type === "battleFinished");
      const losses = finished?.type === "battleFinished" ? finished.heroLosses : [];
      const left = before.map((stack, slot) => stack.count - (losses[slot]?.lost ?? 0));
      expect(left.every((count, slot) => count >= 0 && count <= (before[slot]?.count ?? 0))).toBe(
        true,
      );
      // Армия победителя — выжившие по порядку, без пустых отрядов; у проигравшего героя нет.
      const expected = before
        .map((stack, slot) => ({ ...stack, count: left[slot] ?? 0 }))
        .filter((stack) => stack.count > 0);
      const won = finished?.type === "battleFinished" && finished.outcome === "won";
      expect(after.heroes[0]?.army ?? []).toEqual(won ? expected : []);
      expect(after.heroes.length).toBe(won ? 1 : 0);
    }
  });

  it("поражение: героя нет, у охранника выжившие, партия окончена", () => {
    const { state } = inBattle(["militia:3"], 200);
    const { state: after, events } = playBattleOut(state);
    expect(after.heroes).toEqual([]);
    expect(after.battle).toBeNull();
    expect(after.outcome).toBe("defeat");
    const [object] = after.objects;
    const count = object?.type === "guard" ? object.count : 0;
    expect(count).toBeGreaterThan(190);
    expect(count).toBeLessThanOrEqual(200);
    // Сила охранника после боя — число выживших, накопленная дробь роста сброшена.
    expect(object).toMatchObject({ power: count * 1000 });
    expect(events.filter((event) => event.type !== "battle").map(formatEvent)).toEqual([
      `Бой окончен: герой разбит; потери героя: militia −3; потери обороняющегося: ${200 - count}`,
      "Герой A погиб",
      "Игрок 1 выбыл: нет ни героя, ни города",
      "Партия окончена: поражение",
    ]);
    // После поражения отклоняются все команды.
    for (const command of [END, TO_ZONE, { type: "battleWait", side: 0 } as const]) {
      expect(applyCommand(after, command)).toMatchObject({ ok: false, code: "GAME_OVER" });
    }
  });

  it("бегство: герой исчезает вместе с армией, охранник цел, партия окончена", () => {
    const { state } = inBattle(["militia:20"], 15);
    const result = applyCommand(state, { type: "battleFlee", side: 0 });
    const after = result.ok ? result.state : state;
    expect(after.heroes).toEqual([]);
    expect(after.outcome).toBe("defeat");
    expect(after.objects[0]).toMatchObject({ count: 15, power: 15_000 });
    const lines = (result.ok ? result.events : [])
      .filter((event) => event.type !== "battle")
      .map(formatEvent);
    expect(lines).toEqual([
      "Бой окончен: герой бежал; потери героя: militia −20; потери обороняющегося: 0",
      "Герой A бежал и покинул карту",
      "Игрок 1 выбыл: нет ни героя, ни города",
      "Партия окончена: поражение",
    ]);
  });

  it("несколько уровней за бой: события уровня идут после события конца боя", () => {
    // 200 ополченцев × 12 = 2400 опыта: уровни 2 и 3.
    const { state } = inBattle(["falcon:400"], 200);
    const { state: after, events } = playBattleOut(state);
    const hero = after.heroes[0];
    expect(hero).toMatchObject({ experience: 2400, level: 3 });
    // Начальные атака 2 и защита 1, плюс по единице за каждый из двух уровней.
    expect((hero?.attack ?? 0) + (hero?.defense ?? 0)).toBe(5);
    expect(events.filter((event) => event.type !== "battle").map((event) => event.type)).toEqual([
      "battleFinished",
      "guardDefeated",
      "experienceGained",
      "levelGained",
      "levelGained",
    ]);
  });

  it("шахту в зоне охранника герой занимает после победы", () => {
    const mine: MapObjectDefinition = { type: "mine", x: 3, y: 0, kind: "sawmill" };
    const { state } = inBattle(["falcon:30"], 5, 1, [mine]);
    const { state: after, events } = playBattleOut(state);
    expect(after.objects).toMatchObject([{ id: "o2", owner: 0 }]);
    expect(events.at(-1)).toMatchObject({ type: "mineCaptured", objectId: "o2" });
  });

  it("победив одного охранника, герой стоит в зоне другого без боя и может напасть", () => {
    const second: MapObjectDefinition = {
      type: "guard",
      x: 4,
      y: 2,
      creature: "slinger",
      count: 3,
    };
    const initial = gameWith(OPEN_FIELD, [guard(5), second], { army: ["falcon:30"] });
    const entered = applyCommand(placeHero(initial, 2, 1), {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["E"],
    });
    const { state: after } = playBattleOut(entered.ok ? entered.state : initial);
    expect(after.battle).toBeNull();
    expect(after.objects.map((object) => object.id)).toEqual(["o2"]);
    const attack = applyCommand(after, { type: "moveHero", player: 0, heroId: "A", path: ["SE"] });
    expect(attack).toMatchObject({ ok: true, state: { battle: { guardId: "o2" } } });
  });
});

describe("повтор партии с боем", () => {
  it("повтор из начального состояния даёт то же состояние и те же события", () => {
    const { initial, state, events } = inBattle(["militia:12", "slinger:6"], 14, 3);
    const played = playBattleOut(state);
    const commands: Command[] = [TO_ZONE, ...played.commands];
    const replayed = replay(initial, commands);
    expect(replayed).toEqual({
      ok: true,
      state: played.state,
      events: [...events, ...played.events],
    });
  });

  it("отклонённая команда боя не меняет состояние и не тратит случайных чисел", () => {
    const { state } = inBattle(["militia:12"], 14);
    const before: GameState = JSON.parse(JSON.stringify(state)) as GameState;
    applyCommand(state, { type: "battleMove", side: 0, to: { col: 14, row: 10 } });
    applyCommand(state, END);
    expect(state).toEqual(before);
    expect(playBattleOut(state).state).toEqual(playBattleOut(before).state);
  });
});
