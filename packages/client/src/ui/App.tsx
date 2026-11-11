import { calendarOf, DAILY_MOVEMENT } from "@homamru/core";
import { useSyncExternalStore } from "react";
import { activeHero } from "../game/session.ts";
import type { Session } from "../game/session.ts";

interface AppProps {
  readonly session: Session;
}

/** Интерфейс поверх карты: дата, запас хода героя, кнопка конца дня. */
export function App({ session }: AppProps) {
  const { state } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { month, week, weekday } = calendarOf(state.day);
  const hero = activeHero(state);

  return (
    <>
      <div className="hud hud-info">
        <div className="hud-date">
          Месяц {month}, неделя {week}, день {weekday}
        </div>
        {hero !== undefined && (
          <div className="hud-movement">
            Запас хода: {hero.movement} из {DAILY_MOVEMENT}
          </div>
        )}
      </div>
      <button type="button" className="hud hud-end-day" onClick={session.endTurn}>
        Конец дня
      </button>
    </>
  );
}
