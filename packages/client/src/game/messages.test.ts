// Короткие сообщения игроку: docs/mechanics/24-map-screen.md, 33-town-screen.md, 43-opponent-screen.md.
import { CONTENT } from "@homamru/core/testkit";
import { createGame, MINE_KINDS } from "@homamru/core";
import type { GameEvent, GameState, MapObjectDefinition } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { townlessText } from "./captions.ts";
import { messagesOf } from "./messages.ts";

type Kind = GameEvent["type"];

/**
 * Куда попадает каждое событие ядра. «строка» — короткое сообщение (`messages.ts`);
 * иначе сказано, где игрок видит случившееся. Новое событие обязано появиться здесь:
 * тест падает, пока его не описали.
 */
const WHERE_SHOWN: Readonly<Record<Kind, string>> = {
  heroStepped: "шаг героя виден на карте",
  turnEnded: "ход меняется надписью «Ход противника»",
  dayStarted: "дата в полосе наверху",
  pilePicked: "строка",
  mineCaptured: "строка",
  incomeReceived: "строка",
  guardGrew: "не сообщается: точного числа охранника игрок не видит",
  battleStarted: "экран боя",
  battle: "экран боя",
  battleFinished: "окно итога боя",
  guardDefeated: "строка",
  heroDied: "окно итога боя и окно партии",
  gameOver: "окна «Победа» и «Поражение»",
  garrisonJoined: "гарнизон перед боем за город виден на экране города",
  townCaptured: "строка",
  townlessCountdown: "строка",
  playerEliminated: "окна «Победа» и «Поражение»",
  experienceGained: "окно итога боя",
  buildingBuilt: "строка",
  creaturesGrew: "строка",
  creaturesRecruited: "строка",
  creaturesTransferred: "перенос делает сам игрок на экране города",
  heroHired: "строка",
  tavernChanged: "состав таверны виден в её разделе",
  skillsOffered: "окно нового уровня",
  skillLearned: "строка",
  levelGained: "строка",
  resourcesTraded: "строка",
  bookBought: "строка",
  mapSpellCast: "строка",
  spellsLearned: "строка",
};

function newGame(objects: readonly MapObjectDefinition[] = []): GameState {
  const created = createGame(
    {
      id: "test",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [
        { hero: { x: 0, y: 0, army: [{ creature: "militia", count: 10 }] } },
        { hero: { x: 7, y: 7, army: [{ creature: "militia", count: 10 }] }, kind: "computer" },
      ],
      objects,
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

/** Шахты всех семи видов по порядку; идентификаторы — как их раздаёт карта. */
function mines(): MapObjectDefinition[] {
  return MINE_KINDS.map((kind, index) => ({
    type: "mine",
    x: index,
    y: 2,
    kind,
  }));
}

/** События, о которых строкой не пишут: о них говорит другой экран. */
const SILENT: readonly GameEvent[] = [
  {
    type: "heroStepped",
    heroId: "A",
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    cost: 100,
    movementLeft: 900,
  },
  { type: "turnEnded", player: 0 },
  { type: "dayStarted", day: 2, month: 1, week: 1, weekday: 2 },
  { type: "guardGrew", objectId: "o1", from: 10, to: 11 },
  { type: "battleStarted", heroId: "A", guardId: "o1", defenderHeroId: null, townId: null },
  { type: "battle", event: { type: "roundStarted", round: 2 } },
  { type: "battleFinished", outcome: "won", heroLosses: [], guardLost: 2, defenderLosses: [] },
  { type: "heroDied", heroId: "B", reason: "destroyed" },
  { type: "gameOver", outcome: "victory", winner: 0 },
  { type: "garrisonJoined", townId: "o1", heroId: "A", army: [] },
  {
    type: "creaturesTransferred",
    townId: "o1",
    heroId: "A",
    from: "garrison",
    creature: "militia",
    count: 3,
  },
  { type: "tavernChanged", player: 0, offers: [] },
  { type: "skillsOffered", heroId: "A", skills: ["wisdom"] },
  { type: "playerEliminated", player: 1, reason: "nothing" },
  { type: "experienceGained", heroId: "A", amount: 60, total: 60 },
];

describe("сообщения игроку", () => {
  it("у каждого из 31 события ядра сказано, где игрок его видит", () => {
    expect(Object.keys(WHERE_SHOWN)).toHaveLength(31);
  });

  it("строкой показываются 16 событий, остальные 15 — другим экраном", () => {
    const withMessage = Object.values(WHERE_SHOWN).filter((where) => where === "строка");
    expect(withMessage).toHaveLength(16);
    expect(Object.keys(WHERE_SHOWN)).toHaveLength(withMessage.length + SILENT.length);
  });

  it("счёт дней без города пишется одинаково в полосе наверху и в сообщении", () => {
    expect(townlessText(7)).toBe("Без города: осталось дней — 7");
    const state = newGame();
    expect(
      messagesOf([{ type: "townlessCountdown", player: 0, daysLeft: 3 }], {
        before: state,
        after: state,
      }),
    ).toEqual(["Без города: осталось дней — 3"]);
  });

  it("шахты: своя — «занята», у противника — «занял» и винительный падеж", () => {
    // Слова — из 24-map-screen.md, «Сообщения», и 43-opponent-screen.md, «Ход противника».
    const own = [
      "Лесопилка занята",
      "Рудник занята",
      "Золотая шахта занята",
      "Лаборатория алхимика занята",
      "Серный карьер занята",
      "Кристальная пещера занята",
      "Самоцветный пруд занята",
    ];
    const theirs = [
      "Противник занял лесопилку",
      "Противник занял рудник",
      "Противник занял золотую шахту",
      "Противник занял лабораторию алхимика",
      "Противник занял серный карьер",
      "Противник занял кристальную пещеру",
      "Противник занял самоцветный пруд",
    ];
    const state = newGame(mines());
    MINE_KINDS.forEach((_kind, index) => {
      const id = `o${index + 1}`;
      const taken: GameEvent = {
        type: "mineCaptured",
        objectId: id,
        owner: 0,
        previousOwner: null,
      };
      expect(messagesOf([taken], { before: state, after: state })).toEqual([own[index]]);
      expect(
        messagesOf([{ type: "mineCaptured", objectId: id, owner: 1, previousOwner: 0 }], {
          before: state,
          after: state,
        }),
      ).toEqual([theirs[index]]);
    });
  });

  it("противник нанял героя — строкой с именем из данных", () => {
    const state = newGame([{ type: "town", x: 5, y: 5, owner: 1, buildings: ["tavern"] }]);
    const event: GameEvent = {
      type: "heroHired",
      heroId: "C",
      hero: "velena",
      townId: "o1",
      cost: 2500,
      army: [],
    };
    expect(messagesOf([event], { before: state, after: state })).toEqual([
      "Противник нанял героя: Велена",
    ]);
  });

  it("событие без строки не даёт игроку ни одной", () => {
    const state = newGame();
    expect(messagesOf(SILENT, { before: state, after: state })).toEqual([]);
  });
});
