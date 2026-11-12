/**
 * Текст событий этапов 3 и 5: охранники, бой внутри партии, опыт героя, игроки.
 * Спецификации: docs/mechanics/21-guards.md, 22-hero.md, 23-map-battle.md,
 * 40-two-players.md, 41-victory.md.
 */
import { formatBattleEvent } from "./battle/render.ts";
import type { GameEvent } from "./events.ts";

type Stage3Event = Extract<
  GameEvent,
  {
    type:
      | "guardGrew"
      | "battleStarted"
      | "battle"
      | "battleFinished"
      | "guardDefeated"
      | "heroDied"
      | "gameOver"
      | "experienceGained"
      | "levelGained"
      | "garrisonJoined"
      | "townCaptured"
      | "townlessCountdown"
      | "playerEliminated";
  }
>;

const OUTCOME_NAMES = { won: "победа героя", lost: "герой разбит", fled: "герой бежал" } as const;
const STAT_NAMES = { attack: "атака", defense: "защита" } as const;

const ELIMINATION_NAMES = {
  nothing: "нет ни героя, ни города",
  townless: "вышли семь дней без города",
} as const;

/** С кем начался бой: охранник, герой (может быть, в городе) или гарнизон города. */
function formatDefender(event: Extract<Stage3Event, { type: "battleStarted" }>): string {
  if (event.guardId !== null) {
    return `охранника ${event.guardId}`;
  }
  const town = event.townId === null ? "" : ` в городе ${event.townId}`;
  return event.defenderHeroId === null
    ? `гарнизона города ${event.townId ?? ""}`
    : `героя ${event.defenderHeroId}${town}`;
}

/** Печатает событие одной строкой. */
export function formatBattleSideEvent(event: Stage3Event): string {
  switch (event.type) {
    case "guardGrew":
      return `Охранник ${event.objectId} вырос: было ${event.from}, стало ${event.to}`;
    case "battleStarted":
      return `Начался бой: герой ${event.heroId} против ${formatDefender(event)}`;
    case "battle":
      return `Бой: ${formatBattleEvent(event.event)}`;
    case "battleFinished": {
      const losses = event.heroLosses.map((loss) => `${loss.creature} −${loss.lost}`).join(", ");
      return `Бой окончен: ${OUTCOME_NAMES[event.outcome]}; потери героя: ${losses}; потери обороняющегося: ${event.guardLost}`;
    }
    case "guardDefeated":
      return `Охранник ${event.objectId} побеждён`;
    case "heroDied":
      return `Герой ${event.heroId} ${event.reason === "fled" ? "бежал и покинул карту" : "погиб"}`;
    case "gameOver":
      return event.winner === null
        ? "Партия окончена: поражение"
        : `Партия окончена: победил игрок ${event.winner + 1}`;
    case "garrisonJoined": {
      const army = event.army.map((stack) => `${stack.creature} ${stack.count}`).join(", ");
      return `Гарнизон города ${event.townId} перешёл к герою ${event.heroId}: ${army}`;
    }
    case "townCaptured":
      return `Игрок ${event.owner + 1} захватил город ${event.townId} у игрока ${event.previousOwner + 1}${event.fought ? "" : " без боя"}`;
    case "townlessCountdown":
      return `Игрок ${event.player + 1} без города: осталось дней — ${event.daysLeft}`;
    case "playerEliminated":
      return `Игрок ${event.player + 1} выбыл: ${ELIMINATION_NAMES[event.reason]}`;
    case "experienceGained":
      return `Герой ${event.heroId} получил опыт: +${event.amount}, всего ${event.total}`;
    case "levelGained":
      return `Герой ${event.heroId} получил уровень ${event.level}: ${STAT_NAMES[event.stat]} +1`;
  }
}
