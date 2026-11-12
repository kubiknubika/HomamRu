import { calendarOf, DAILY_MOVEMENT, RESOURCES, townOf } from "@homamru/core";
import { useState, useSyncExternalStore } from "react";
import { describeObject, fightWarning, RESOURCE_NAMES } from "../game/captions.ts";
import { activeHero } from "../game/session.ts";
import type { Session } from "../game/session.ts";
import { HeroWindow } from "./HeroWindow.tsx";
import { Legend } from "./Legend.tsx";
import { Messages } from "./Messages.tsx";
import { TownScreen } from "./TownScreen.tsx";

interface HudProps {
  readonly session: Session;
}

/** Интерфейс поверх карты: ресурсы, дата, запас хода, подписи, кнопки героя и конца дня. */
export function Hud({ session }: HudProps) {
  const { state, selection, inspected, notice, townOpen } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const [heroOpen, setHeroOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const { month, week, weekday } = calendarOf(state.day);
  const hero = activeHero(state);
  const town = townOf(state, state.currentPlayer);
  const resources = state.players[state.currentPlayer]?.resources;
  // Подпись объекта по удержанию важнее предупреждения о бое: игрок только что её попросил.
  const caption =
    inspected !== null
      ? describeObject(state, inspected)
      : selection !== null && selection.guard !== null
        ? fightWarning(state, selection.guard)
        : null;

  return (
    <>
      <div className="hud hud-info">
        {resources !== undefined && (
          <div className="hud-resources">
            {RESOURCES.map((resource) => (
              <span key={resource} className={`hud-resource hud-resource-${resource}`}>
                {RESOURCE_NAMES[resource]} {resources[resource]}
              </span>
            ))}
          </div>
        )}
        <div className="hud-date">
          Месяц {month}, неделя {week}, день {weekday}
        </div>
        {hero !== undefined && (
          <div className="hud-movement">
            Запас хода: {hero.movement} из {DAILY_MOVEMENT}
          </div>
        )}
      </div>
      <div className="hud-notes">
        {caption !== null && <div className="hud hud-caption">{caption}</div>}
        {notice !== null && !townOpen && <Messages notice={notice} />}
      </div>
      <div className="hud-actions">
        <button
          type="button"
          className="hud hud-button"
          onClick={() => {
            setLegendOpen(true);
          }}
        >
          Обозначения
        </button>
        {town !== undefined && (
          <button type="button" className="hud hud-button" onClick={session.openTown}>
            Город
          </button>
        )}
        {hero === undefined ? (
          <div className="hud hud-hint">Героя нет: наймите в таверне города</div>
        ) : (
          <button
            type="button"
            className="hud hud-button"
            onClick={() => {
              setHeroOpen(true);
            }}
          >
            Герой
          </button>
        )}
        <button type="button" className="hud hud-button hud-end-day" onClick={session.endTurn}>
          Конец дня
        </button>
      </div>
      {legendOpen && (
        <Legend
          state={state}
          onClose={() => {
            setLegendOpen(false);
          }}
        />
      )}
      {townOpen && town !== undefined && <TownScreen session={session} town={town} />}
      {heroOpen && hero !== undefined && (
        <HeroWindow
          state={state}
          hero={hero}
          onClose={() => {
            setHeroOpen(false);
          }}
        />
      )}
    </>
  );
}
