// Экран карты на этапе 3: docs/mechanics/24-map-screen.md.
import { CONTENT } from "@homamru/core/testkit";
import { createGame } from "@homamru/core";
import type { Command, GameEvent, GameState, MapObjectDefinition } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { describeCell, fightWarning } from "./captions.ts";
import { messagesOf } from "./messages.ts";
import { finishBattle, go } from "./screenKit.ts";
import { createSession } from "./session.ts";

const OBJECTS: MapObjectDefinition[] = [
  { type: "guard", x: 4, y: 0, creature: "militia", count: 5 },
  { type: "mine", x: 3, y: 1, kind: "sawmill" },
  { type: "pile", x: 0, y: 2, resource: "gold", amount: 700 },
  { type: "guard", x: 6, y: 6, creature: "falcon", count: 300 },
];

function newGame(army = [{ creature: "falcon", count: 30 }]): GameState {
  const created = createGame(
    {
      id: "test",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [{ hero: { x: 0, y: 0, army } }],
      objects: OBJECTS,
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

describe("подписи и предупреждение о бое", () => {
  it("касание охранника: путь до соседней клетки и подпись «будет бой»", () => {
    const session = createSession(newGame());
    session.tapCell({ x: 4, y: 0 });
    const { selection, state } = session.getSnapshot();
    expect(selection).toMatchObject({
      path: { found: true, steps: ["E", "E", "E"] },
      fight: { kind: "guard", guard: { id: "o1" } },
    });
    const fight = selection?.fight;
    expect(fight === null || fight === undefined ? "" : fightWarning(state, fight)).toBe(
      "Ополченец, несколько (5–9) — будет бой",
    );
  });

  it("касание клетки рядом с охранником предупреждает так же; клетка вдали — нет", () => {
    const session = createSession(newGame());
    session.tapCell({ x: 3, y: 1 });
    expect(session.getSnapshot().selection?.fight).toMatchObject({ guard: { id: "o1" } });
    session.tapCell({ x: 2, y: 3 });
    expect(session.getSnapshot().selection).toMatchObject({ path: { found: true }, fight: null });
  });

  it("удержание пальца показывает подпись объекта, касание её убирает", () => {
    const session = createSession(newGame());
    const state = session.getSnapshot().state;
    const captions = OBJECTS.map((object) => {
      session.inspectCell(object);
      const { inspected } = session.getSnapshot();
      return inspected === null ? "" : describeCell(state, inspected);
    });
    expect(captions).toEqual([
      "Охранник: Ополченец, несколько (5–9)",
      "Лесопилка, ничья. В день: дерево +2",
      "Кучка: золото 700",
      "Охранник: Сокол, полчище (250–499)",
    ]);
    session.tapCell({ x: 1, y: 1 });
    expect(session.getSnapshot().inspected).toBeNull();
    // На пустой клетке рассматривать нечего.
    session.inspectCell({ x: 5, y: 5 });
    expect(session.getSnapshot().inspected).toBeNull();
  });
});

describe("сообщения", () => {
  it("подбор кучки, занятая шахта, доход и новый уровень — по строке", () => {
    const session = createSession(newGame());
    const seen: string[] = [];
    session.subscribe((snapshot, events) => {
      seen.push(...messagesOf(events, { before: snapshot.state, after: snapshot.state }));
    });
    go(session, 0, 2);
    expect(seen).toEqual(["Подобрано: золото 700"]);
    const state = session.getSnapshot().state;
    const events: GameEvent[] = [
      { type: "mineCaptured", objectId: "o2", owner: 0, previousOwner: null },
      { type: "incomeReceived", player: 0, income: { gold: 1000, wood: 2, ore: 0 } },
      { type: "incomeReceived", player: 0, income: { gold: 0, wood: 0, ore: 0 } },
      { type: "incomeReceived", player: 1, income: { gold: 5, wood: 0, ore: 0 } },
      { type: "levelGained", heroId: "A", level: 2, stat: "attack" },
      { type: "guardGrew", objectId: "o1", from: 5, to: 6 },
    ];
    // Рост охранника игроку не сообщается: точного числа он не видит.
    expect(messagesOf(events, { before: state, after: state })).toEqual([
      "Лесопилка занята",
      "Доход: золото +1000, дерево +2",
      "Новый уровень: атака +1",
    ]);
  });
});

describe("бой внутри партии на экране", () => {
  it("герой встал в зону: путь убран; экран боя открывается, когда карта показала шаги", () => {
    const session = createSession(newGame());
    go(session, 4, 0);
    const walked = session.getSnapshot();
    expect(walked.state.battle).not.toBeNull();
    expect(walked.selection).toBeNull();
    expect(walked.battle).toBeNull();
    // Пока бой не открыт, карта уже не принимает касаний.
    session.tapCell({ x: 0, y: 1 });
    session.endTurn();
    expect(session.getSnapshot().selection).toBeNull();
    expect(session.getSnapshot().state.day).toBe(1);
    session.enterBattle();
    const battle = session.getSnapshot().battle;
    // Армии настоящие: армия героя и охранник.
    expect(
      battle?.getSnapshot().state.stacks.map((stack) => [stack.creature.id, stack.count]),
    ).toEqual([
      ["falcon", 30],
      ["militia", 5],
    ]);
  });

  it("каждая команда боя, игрока и компьютера, уходит в партию и сохраняется", () => {
    const saved: Command[] = [];
    const session = createSession(newGame(), (command) => {
      saved.push(command);
    });
    go(session, 4, 0);
    session.enterBattle();
    finishBattle(session);
    const { state, battle, summary } = session.getSnapshot();
    expect(saved[0]?.type).toBe("moveHero");
    expect(saved.length).toBeGreaterThan(2);
    expect(saved.slice(1).every((command) => command.type.startsWith("battle"))).toBe(true);
    expect(saved.slice(1).some((command) => "side" in command && command.side === 1)).toBe(true);
    // Бой в партии окончен, но экран боя остаётся, пока игрок не закрыл окно итога.
    expect(state.battle).toBeNull();
    expect(battle?.getSnapshot().state.result).toMatchObject({ winner: 0 });
    expect(summary).toEqual({ experience: 60, levels: [], enemyHeroDefeated: false });
    expect(state.objects.some((object) => object.id === "o1")).toBe(false);
  });

  it("окно итога закрыто: экран возвращается к карте, карта узнаёт о занятой шахте", () => {
    const session = createSession(newGame());
    // Лесопилка стоит в зоне охранника: герой встаёт на неё, после победы она его.
    go(session, 3, 1);
    session.enterBattle();
    finishBattle(session);
    const seen: string[] = [];
    session.subscribe((snapshot, events) => {
      seen.push(...messagesOf(events, { before: snapshot.state, after: snapshot.state }));
    });
    session.leaveBattle();
    expect(session.getSnapshot().battle).toBeNull();
    expect(seen).toEqual(["Лесопилка занята"]);
    // Сообщение лежит в снимке: интерфейс карты появится позже и всё равно его покажет.
    expect(session.getSnapshot().notice).toEqual({ id: 1, lines: ["Лесопилка занята"] });
    // Карта снова принимает касания.
    session.tapCell({ x: 5, y: 3 });
    expect(session.getSnapshot().selection).toMatchObject({ path: { found: true } });
  });

  it("пока бой идёт, закрыть экран боя нельзя", () => {
    const session = createSession(newGame());
    go(session, 4, 0);
    session.enterBattle();
    session.leaveBattle();
    expect(session.getSnapshot().battle).not.toBeNull();
  });

  it("сохранение сделано посреди боя: партия сразу открывает экран боя с того же хода", () => {
    const first = createSession(newGame());
    go(first, 4, 0);
    first.enterBattle();
    const battle = first.getSnapshot().battle;
    battle?.animationDone();
    battle?.defend();
    const saved = first.getSnapshot().state;
    const resumed = createSession(JSON.parse(JSON.stringify(saved)) as GameState);
    expect(resumed.getSnapshot().battle?.getSnapshot().state).toEqual(saved.battle?.state);
  });

  it("бегство: партия окончена, карта касаний не принимает", () => {
    const session = createSession(newGame());
    go(session, 4, 0);
    session.enterBattle();
    const battle = session.getSnapshot().battle;
    battle?.animationDone();
    battle?.flee();
    const { state, summary } = session.getSnapshot();
    expect(state.outcome).toBe("defeat");
    expect(state.heroes).toEqual([]);
    expect(summary).toEqual({ experience: 0, levels: [], enemyHeroDefeated: false });
    session.leaveBattle();
    session.tapCell({ x: 1, y: 1 });
    session.endTurn();
    expect(session.getSnapshot()).toMatchObject({ selection: null, state: { day: 1 } });
  });
});
