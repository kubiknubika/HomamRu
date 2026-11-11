/**
 * Ходы игроков и календарь. Спецификация: docs/mechanics/03-time.md.
 */
import { DAILY_MOVEMENT } from "./game.ts";
import type { CommandResult, EndTurnCommand, GameEvent, GameState } from "./types.ts";

const DAYS_IN_WEEK = 7;
const WEEKS_IN_MONTH = 4;

export interface CalendarDate {
  readonly month: number;
  readonly week: number;
  readonly weekday: number;
}

/** Месяц, неделя и день недели по номеру дня партии (все с единицы). */
export function calendarOf(day: number): CalendarDate {
  const index = day - 1;
  return {
    month: Math.floor(index / (DAYS_IN_WEEK * WEEKS_IN_MONTH)) + 1,
    week: (Math.floor(index / DAYS_IN_WEEK) % WEEKS_IN_MONTH) + 1,
    weekday: (index % DAYS_IN_WEEK) + 1,
  };
}

export function applyEndTurn(state: GameState, command: EndTurnCommand): CommandResult {
  const events: GameEvent[] = [{ type: "turnEnded", player: command.player }];
  const next = state.currentPlayer + 1;
  if (next < state.players.length) {
    return { ok: true, state: { ...state, currentPlayer: next }, events };
  }
  const day = state.day + 1;
  events.push({ type: "dayStarted", day, ...calendarOf(day) });
  return {
    ok: true,
    state: {
      ...state,
      day,
      currentPlayer: 0,
      heroes: state.heroes.map((hero) => ({ ...hero, movement: DAILY_MOVEMENT })),
    },
    events,
  };
}
