/**
 * Ходы игроков и календарь. Спецификация: docs/mechanics/03-time.md.
 */
import { DAILY_MOVEMENT } from "./heroIds.ts";
import { growGuards } from "./guards.ts";
import { giveIncome } from "./objects.ts";
import { countTownlessDay, firstPlayer, nextPlayerAfter } from "./players.ts";
import { refreshTavern } from "./tavern.ts";
import { startTownDay } from "./town.ts";
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

export function applyEndTurn(initial: GameState, command: EndTurnCommand): CommandResult {
  const events: GameEvent[] = [{ type: "turnEnded", player: command.player }];
  // Семь дней без города считаются в конце хода самого игрока (41-victory.md).
  const state = countTownlessDay(initial, command.player, events);
  if (state.outcome !== null) {
    return { ok: true, state, events };
  }
  const next = nextPlayerAfter(state, state.currentPlayer);
  if (next !== null) {
    const turn = giveIncome({ ...state, currentPlayer: next }, next, events);
    return { ok: true, state: turn, events };
  }
  const day = state.day + 1;
  events.push({ type: "dayStarted", day, ...calendarOf(day) });
  const first = firstPlayer(state);
  const started: GameState = {
    ...state,
    day,
    currentPlayer: first,
    heroes: state.heroes.map((hero) => ({ ...hero, movement: DAILY_MOVEMENT })),
  };
  // Первый день недели, начиная со второй: растут охранники (21-guards.md).
  const newWeek = calendarOf(day).weekday === 1;
  const guarded = newWeek ? growGuards(started, events) : started;
  // В городах снова можно строить; в начале недели жилища дают прирост (31-recruitment.md).
  let grown = startTownDay(guarded, newWeek, events);
  // В начале недели в тавернах новые герои (32-hero-hire.md).
  for (const player of newWeek ? grown.players : []) {
    grown = refreshTavern(grown, player.id, events);
  }
  // Доход приходит в начале хода владельца шахт, до его первой команды.
  return { ok: true, state: giveIncome(grown, first, events), events };
}
