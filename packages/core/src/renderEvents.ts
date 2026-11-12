/**
 * Текст событий этапа 3: охранники, бой внутри партии, опыт героя.
 * Спецификации: docs/mechanics/21-guards.md, 22-hero.md, 23-map-battle.md.
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
      | "levelGained";
  }
>;

const OUTCOME_NAMES = { won: "победа героя", lost: "герой разбит", fled: "герой бежал" } as const;
const STAT_NAMES = { attack: "атака", defense: "защита" } as const;

/** Печатает событие одной строкой. */
export function formatBattleSideEvent(event: Stage3Event): string {
  switch (event.type) {
    case "guardGrew":
      return `Охранник ${event.objectId} вырос: было ${event.from}, стало ${event.to}`;
    case "battleStarted":
      return `Начался бой: герой ${event.heroId} против охранника ${event.guardId}`;
    case "battle":
      return `Бой: ${formatBattleEvent(event.event)}`;
    case "battleFinished": {
      const losses = event.heroLosses.map((loss) => `${loss.creature} −${loss.lost}`).join(", ");
      return `Бой окончен: ${OUTCOME_NAMES[event.outcome]}; потери героя: ${losses}; потери охранника: ${event.guardLost}`;
    }
    case "guardDefeated":
      return `Охранник ${event.objectId} побеждён`;
    case "heroDied":
      return `Герой ${event.heroId} ${event.reason === "fled" ? "бежал и покинул карту" : "погиб"}`;
    case "gameOver":
      return "Партия окончена: поражение";
    case "experienceGained":
      return `Герой ${event.heroId} получил опыт: +${event.amount}, всего ${event.total}`;
    case "levelGained":
      return `Герой ${event.heroId} получил уровень ${event.level}: ${STAT_NAMES[event.stat]} +1`;
  }
}
