import { calendarOf, DAILY_MOVEMENT, RESOURCES, townIncome, townsOf } from "@homamru/core";
import { useState, useSyncExternalStore } from "react";
import { describeCell, fightWarning, RESOURCE_NAMES } from "../game/captions.ts";
import { activeHero, computerToMove, humanOf, sameCell, townlessLeft } from "../game/view.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";
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
  const { state, selection, inspected, notice, townId, townList } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const [heroOpen, setHeroOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const { month, week, weekday } = calendarOf(state.day);
  const hero = activeHero(state);
  const me = humanOf(state);
  const towns = townsOf(state, me);
  const town = towns.find((candidate) => candidate.id === townId);
  const resources = state.players[me]?.resources;
  const opponentTurn = computerToMove(state);
  const daysLeft = townlessLeft(state);
  // Подпись объекта по удержанию важнее предупреждения о бое: игрок только что её попросил.
  const caption =
    (inspected === null ? null : describeCell(state, inspected)) ??
    (selection !== null && selection.fight !== null ? fightWarning(state, selection.fight) : null);

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
        {daysLeft !== null && (
          <div className="hud-townless">Без города: осталось {daysLeft} дн.</div>
        )}
      </div>
      {opponentTurn && (
        <div className="hud hud-opponent">
          Ход противника
          <button type="button" className="hud-button" onClick={session.skipOpponent}>
            Пропустить
          </button>
        </div>
      )}
      <div className="hud-notes">
        {caption !== null && <div className="hud hud-caption">{caption}</div>}
        {notice !== null && town === undefined && <Messages notice={notice} />}
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
        {towns.length > 0 && (
          <button
            type="button"
            className="hud hud-button"
            disabled={opponentTurn}
            onClick={session.openTown}
          >
            Город
          </button>
        )}
        {hero === undefined ? (
          <div className="hud hud-hint">
            {towns.length > 0 ? "Героя нет: наймите в таверне города" : "Героя нет"}
          </div>
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
        <button
          type="button"
          className="hud hud-button hud-end-day"
          disabled={opponentTurn}
          onClick={session.endTurn}
        >
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
      {town !== undefined && <TownScreen session={session} town={town} />}
      {townList && (
        <Dialog title="Ваши города">
          {towns.map((candidate) => {
            const here = hero !== undefined && sameCell(hero, candidate);
            const label = `Клетка (${candidate.x}, ${candidate.y}); золото +${townIncome(state, candidate)} в день; ${here ? "герой здесь" : "героя нет"}`;
            return (
              <DialogButton
                key={candidate.id}
                label={label}
                onClick={() => {
                  session.chooseTown(candidate.id);
                }}
              />
            );
          })}
          <DialogButton label="Закрыть" onClick={session.closeTown} />
        </Dialog>
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
