import { RESOURCES } from "@homamru/core";
import type { GameState, TownState } from "@homamru/core";
import { useState, useSyncExternalStore } from "react";
import { RESOURCE_NAMES } from "../game/captions.ts";
import type { Session } from "../game/session.ts";
import { amountsText, buildingGives, buildingStatus, recruitRows } from "../game/townTexts.ts";
import type { RecruitRow } from "../game/townTexts.ts";
import { Messages } from "./Messages.tsx";
import { TownArmies } from "./TownArmies.tsx";
import { TownTavern } from "./TownTavern.tsx";

interface TownScreenProps {
  readonly session: Session;
  readonly town: TownState;
}

interface SectionProps {
  readonly session: Session;
  readonly state: GameState;
  readonly town: TownState;
}

/** Раздел «Здания»: все здания и что с каждым можно сделать. */
function Buildings({ session, state, town }: SectionProps) {
  return (
    <section className="town-section">
      <h2 className="town-heading">Здания</h2>
      {state.buildings.map((building) => {
        const status = buildingStatus(state, town, building);
        return (
          <div key={building.id} className="town-row">
            <div className="town-row-text">
              <b>{building.name}</b>
              <div className="town-dim">{buildingGives(state, building)}</div>
              {status.kind !== "built" && (
                <div className="town-dim">Цена: {amountsText(building.cost)}</div>
              )}
              {status.kind === "blocked" && <div className="town-reason">{status.reason}</div>}
            </div>
            {status.kind === "built" && <span className="town-built">построено</span>}
            {status.kind === "available" && (
              <button
                type="button"
                className="town-button"
                onClick={() => {
                  session.build(building.id);
                }}
              >
                Построить
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

interface RecruitLineProps {
  readonly row: RecruitRow;
  readonly onRecruit: (count: number) => void;
}

/** Строка найма: существо, числа и выбор, сколько нанять. */
function RecruitLine({ row, onRecruit }: RecruitLineProps) {
  const [wanted, setWanted] = useState(0);
  // Золота стало меньше или существ наняли — выбранное число не больше возможного.
  const count = Math.min(wanted, row.affordable);
  const { creature } = row;
  return (
    <div className="town-row town-recruit">
      <div className="town-row-text">
        <b>{creature.name}</b>
        <div className="town-dim">
          ждёт найма: {row.available} · цена: {creature.price} золота · прирост: {row.growth} в
          неделю
        </div>
        <div>
          Выбрано: {count} — {count * creature.price} золота
        </div>
      </div>
      <div className="town-controls">
        <button
          type="button"
          className="town-button town-step"
          aria-label="Меньше"
          disabled={count <= 0}
          onClick={() => {
            setWanted(count - 1);
          }}
        >
          −
        </button>
        <button
          type="button"
          className="town-button town-step"
          aria-label="Больше"
          disabled={count >= row.affordable}
          onClick={() => {
            setWanted(count + 1);
          }}
        >
          +
        </button>
        <button
          type="button"
          className="town-button"
          disabled={row.affordable <= 0}
          onClick={() => {
            setWanted(row.affordable);
          }}
        >
          Все
        </button>
        <button
          type="button"
          className="town-button town-go"
          disabled={count <= 0}
          onClick={() => {
            onRecruit(count);
            setWanted(0);
          }}
        >
          Нанять
        </button>
      </div>
    </div>
  );
}

/** Раздел «Наём»: строка на каждое построенное жилище. Нанятые идут в гарнизон. */
function Recruitment({ session, state, town }: SectionProps) {
  const rows = recruitRows(state, town);
  return (
    <section className="town-section">
      <h2 className="town-heading">Наём</h2>
      {rows.length === 0 && <div className="town-dim">Жилищ нет: постройте двор ополченцев.</div>}
      {rows.map((row) => (
        <RecruitLine
          key={row.creature.id}
          row={row}
          onRecruit={(count) => {
            session.recruit(row.creature.id, count);
          }}
        />
      ))}
      {rows.length > 0 && <div className="town-dim">Нанятые встают в гарнизон.</div>}
    </section>
  );
}

/** Экран города: окно поверх карты (docs/mechanics/33-town-screen.md). */
export function TownScreen({ session, town }: TownScreenProps) {
  const { state, notice } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const resources = state.players[town.owner]?.resources;
  const hasTavern = state.buildings.some(
    (building) => building.tavern === true && town.buildings.includes(building.id),
  );
  return (
    <div className="backdrop">
      <div className="town">
        <div className="town-top">
          <div className="town-title">Город</div>
          {resources !== undefined && (
            <div className="hud-resources">
              {RESOURCES.map((resource) => (
                <span key={resource} className={`hud-resource hud-resource-${resource}`}>
                  {RESOURCE_NAMES[resource]} {resources[resource]}
                </span>
              ))}
            </div>
          )}
          <button type="button" className="town-button town-close" onClick={session.closeTown}>
            Закрыть
          </button>
        </div>
        <div className="town-notice">{notice !== null && <Messages notice={notice} />}</div>
        <div className="town-body">
          <Buildings session={session} state={state} town={town} />
          <Recruitment session={session} state={state} town={town} />
          <TownArmies session={session} state={state} town={town} />
          {hasTavern && <TownTavern session={session} state={state} town={town} />}
        </div>
      </div>
    </div>
  );
}
