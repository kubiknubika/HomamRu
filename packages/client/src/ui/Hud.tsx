import { calendarOf, DAILY_MOVEMENT, RESOURCES } from "@homamru/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { describeObject, fightWarning, RESOURCE_NAMES } from "../game/captions.ts";
import { activeHero } from "../game/session.ts";
import type { Notice, Session } from "../game/session.ts";
import { HeroWindow } from "./HeroWindow.tsx";
import { Legend } from "./Legend.tsx";

interface HudProps {
  readonly session: Session;
}

/** Сколько секунд сообщение остаётся на экране. */
const MESSAGE_MS = 4000;

/** Сообщение о случившемся: строки на несколько секунд. */
function Messages({ notice }: { readonly notice: Notice }) {
  const [hiddenId, setHiddenId] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setHiddenId(notice.id);
    }, MESSAGE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice.id]);
  if (hiddenId === notice.id) {
    return null;
  }
  return (
    <div className="hud hud-message">
      {notice.lines.map((line, index) => (
        // Строки одного сообщения не переставляются.
        // oxlint-disable-next-line react/no-array-index-key
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}

/** Интерфейс поверх карты: ресурсы, дата, запас хода, подписи, кнопки героя и конца дня. */
export function Hud({ session }: HudProps) {
  const { state, selection, inspected, notice } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const [heroOpen, setHeroOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const { month, week, weekday } = calendarOf(state.day);
  const hero = activeHero(state);
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
        {notice !== null && <Messages notice={notice} />}
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
        {hero !== undefined && (
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
