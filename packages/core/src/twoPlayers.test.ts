// Правила и примеры из docs/mechanics/40-two-players.md.
import { describe, expect, it } from "vitest";
import { playBattleOut } from "./battleAuto.ts";
import { applyCommand } from "./commands.ts";
import {
  army,
  duel,
  end,
  enemyTown,
  HOME,
  lines,
  move,
  put,
  run,
  START,
  TO_HERO,
  TO_TOWN,
  untilTurnOf,
  withoutHero,
} from "./duelKit.ts";
import { DAILY_MOVEMENT } from "./game.ts";
import { findPath } from "./pathfinding.ts";
import { formatEvent } from "./render.ts";
import { CONTENT } from "./testkit.ts";

describe("игроки", () => {
  it("вид игрока берётся из карты; по умолчанию — человек", () => {
    const state = duel([HOME, enemyTown()]);
    expect(state.players.map((player) => player.kind)).toEqual(["human", "computer"]);
    expect(state.players.every((player) => !player.eliminated)).toBe(true);
    expect(state.winner).toBeNull();
  });
});

describe("бой героя с героем", () => {
  it("путь до клетки чужого героя: последний шаг не делается, начинается бой", () => {
    const state = duel([HOME, enemyTown()]);
    expect(findPath(state, "A", { x: 4, y: 0 })).toMatchObject({ steps: ["E", "E", "E", "E"] });
    const after = run(state, TO_HERO);
    expect(after.heroes[0]).toMatchObject({ x: 3, y: 0, movement: DAILY_MOVEMENT - 400 });
    expect(after.battle).toMatchObject({ heroId: "A", guardId: null, defenderHeroId: "B" });
    expect(after.battle?.townId).toBeNull();
    expect(after.battle?.state.sides.map((side) => side.hero)).toEqual([
      { attack: 0, defense: 0 },
      { attack: 0, defense: 0 },
    ]);
    expect(lines(state, TO_HERO).at(-1)).toBe("Начался бой: герой A против героя B");
  });

  it("сквозь чужого героя пройти нельзя", () => {
    const state = duel([HOME, enemyTown()]);
    expect(lines(state, move(0, "E", "E", "E", "E", "E"))).toEqual(["STEP_BLOCKED"]);
  });

  it("победа: опыт за убитых и 500 за героя; побеждённый пропал, партия идёт", () => {
    const { state, events } = playBattleOut(run(duel([HOME, enemyTown()]), TO_HERO));
    expect(state.heroes.map((hero) => hero.id)).toEqual(["A"]);
    // 10 ополченцев со здоровьем 12 — 120, и 500 за героя.
    expect(events).toContainEqual(
      expect.objectContaining({ type: "experienceGained", heroId: "A", amount: 620 }),
    );
    expect(events).toContainEqual({ type: "heroDied", heroId: "B", reason: "destroyed" });
    expect(state.outcome).toBeNull();
    expect(state.players[1]).toMatchObject({ eliminated: false, townlessDays: null });
  });

  it("поражение нападающего: его нет, у обороняющегося выжившие и опыт с 500", () => {
    const start = duel([HOME, enemyTown()], army("militia:5"), army("militia:100"));
    const { state, events } = playBattleOut(run(start, TO_HERO));
    expect(state.heroes.map((hero) => hero.id)).toEqual(["B"]);
    const left = state.heroes[0]?.army[0]?.count ?? 0;
    expect(left).toBeGreaterThan(90);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "experienceGained", heroId: "B", amount: 5 * 12 + 500 }),
    );
    expect(state.outcome).toBeNull();
  });

  it("бежать может и обороняющийся; за бежавшего 500 не даётся", () => {
    const fighting = untilTurnOf(run(duel([HOME, enemyTown()]), TO_HERO), 1);
    const lost = 10 - (fighting.heroes[1]?.army[0]?.count ?? 0);
    const result = applyCommand(fighting, { type: "battleFlee", side: 1 });
    expect(result.ok).toBe(true);
    const state = result.ok ? result.state : fighting;
    expect(state.heroes.map((hero) => hero.id)).toEqual(["A"]);
    // Опыт — только за убитых до бегства; бежавший теряет армию целиком.
    expect(state.heroes[0]?.experience).toBe(lost * 12);
    const texts = result.ok ? result.events.map(formatEvent) : [];
    expect(texts).toContain("Герой B бежал и покинул карту");
    expect(texts.some((text) => text.endsWith("потери обороняющегося: 10"))).toBe(true);
  });

  it("у побеждённого не было города — он выбыл, партия окончена победой", () => {
    const { state, events } = playBattleOut(run(duel([HOME]), TO_HERO));
    expect(state.players[1]?.eliminated).toBe(true);
    expect(state).toMatchObject({ outcome: "victory", winner: 0 });
    expect(events.map(formatEvent).slice(-2)).toEqual([
      "Игрок 2 выбыл: нет ни героя, ни города",
      "Партия окончена: победил игрок 1",
    ]);
    expect(lines(state, end(0))).toEqual(["GAME_OVER"]);
  });
});

describe("нападение на город", () => {
  it("пустой город: герой входит, город захвачен без боя", () => {
    const state = put(duel([HOME, enemyTown()]), "A", 3, 3);
    const after = run(state, TO_TOWN);
    expect(after.battle).toBeNull();
    expect(after.heroes[0]).toMatchObject({ x: 4, y: 4 });
    expect(after.objects[1]).toMatchObject({ owner: 0, buildings: START, garrison: [] });
    expect(lines(state, TO_TOWN).slice(1)).toEqual([
      "Игрок 1 захватил город o2 у игрока 2 без боя",
      "Игрок 2 без города: осталось дней — 7",
    ]);
    expect(after.players[1]).toMatchObject({ townlessDays: 0, tavern: [] });
  });

  it("сквозь чужой город пройти нельзя", () => {
    const state = put(duel([HOME, enemyTown()]), "A", 3, 3);
    expect(lines(state, move(0, "SE", "SE"))).toEqual(["STEP_BLOCKED"]);
  });

  it("только гарнизон: бой без героя у обороняющегося; победа — город захвачен, герой в нём", () => {
    const state = put(duel([HOME, enemyTown(army("militia:5", "slinger:4"))]), "A", 3, 3);
    const fighting = run(state, TO_TOWN);
    expect(fighting.heroes[0]).toMatchObject({ x: 3, y: 3 });
    expect(fighting.battle).toMatchObject({ guardId: null, defenderHeroId: null, townId: "o2" });
    expect(fighting.battle?.state.sides[1].hero).toBeNull();
    expect(lines(state, TO_TOWN)).toEqual(["Начался бой: герой A против гарнизона города o2"]);
    const { state: after, events } = playBattleOut(fighting);
    expect(after.heroes[0]).toMatchObject({ x: 4, y: 4 });
    expect(after.objects[1]).toMatchObject({ owner: 0, garrison: [] });
    // За гарнизон без героя 500 не даётся: 5 × 12 + 4 × 8.
    const slinger = CONTENT.creatures.find((creature) => creature.id === "slinger")?.health ?? 0;
    expect(events).toContainEqual(
      expect.objectContaining({ type: "experienceGained", amount: 60 + 4 * slinger }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "townCaptured", townId: "o2", fought: true }),
    );
  });

  it("гарнизон отбился: нападающего нет, в гарнизоне выжившие, город у хозяина", () => {
    const state = put(duel([HOME, enemyTown(army("militia:200"))], army("militia:5")), "A", 3, 3);
    const { state: after } = playBattleOut(run(state, TO_TOWN));
    expect(after.heroes.map((hero) => hero.id)).toEqual(["B"]);
    const town = after.objects[1];
    expect(town).toMatchObject({ owner: 1 });
    expect(town?.type === "town" ? (town.garrison[0]?.count ?? 0) : 0).toBeGreaterThan(190);
    expect(after.outcome).toBeNull();
  });

  it("герой в городе: гарнизон переходит к нему, бой один; бежать обороняющийся не может", () => {
    const garrison = army("militia:5", "slinger:4");
    const state = put(put(duel([HOME, enemyTown(garrison)]), "B", 4, 4), "A", 3, 3);
    const fighting = run(state, TO_TOWN);
    expect(lines(state, TO_TOWN)).toEqual([
      "Гарнизон города o2 перешёл к герою B: militia 5, slinger 4",
      "Начался бой: герой A против героя B в городе o2",
    ]);
    expect(fighting.heroes[1]?.army).toEqual(army("militia:15", "slinger:4"));
    expect(fighting.objects[1]).toMatchObject({ garrison: [] });
    const defenders = fighting.battle?.state.stacks.filter((stack) => stack.side === 1) ?? [];
    expect(defenders.map((stack) => [stack.creature.id, stack.count])).toEqual([
      ["militia", 15],
      ["slinger", 4],
    ]);
    expect(lines(untilTurnOf(fighting, 1), { type: "battleFlee", side: 1 })).toEqual([
      "CANNOT_FLEE",
    ]);
    const fled = run(untilTurnOf(fighting, 0), { type: "battleFlee", side: 0 });
    // Нападающий бежал: его нет; гарнизон остался у героя насовсем.
    expect(fled.heroes.map((hero) => hero.id)).toEqual(["B"]);
    expect(fled.heroes[0]?.army).toEqual(army("militia:15", "slinger:4"));
    expect(fled.objects[1]).toMatchObject({ owner: 1, garrison: [] });
  });

  it("победа над героем в городе: город захвачен, у противника нет ничего — победа", () => {
    const state = put(put(duel([HOME, enemyTown()]), "B", 4, 4), "A", 3, 3);
    const { state: after, events } = playBattleOut(run(state, TO_TOWN));
    expect(after.objects[1]).toMatchObject({ owner: 0 });
    expect(after).toMatchObject({ outcome: "victory", winner: 0 });
    expect(events).toContainEqual({ type: "playerEliminated", player: 1, reason: "nothing" });
  });

  it("у противника только город без героя: захват — победа", () => {
    const state = put(withoutHero(duel([HOME, enemyTown()]), "B"), "A", 3, 3);
    expect(run(state, TO_TOWN)).toMatchObject({ outcome: "victory", winner: 0 });
  });
});
