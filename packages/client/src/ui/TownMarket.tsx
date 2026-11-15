import { RESOURCES } from "@homamru/core";
import type { GameState, Resource, TownState } from "@homamru/core";
import { useState } from "react";
import { RESOURCE_NAMES } from "../game/captions.ts";
import { marketOffer } from "../game/marketTexts.ts";
import type { Session } from "../game/session.ts";

interface TownMarketProps {
  readonly session: Session;
  readonly state: GameState;
  readonly town: TownState;
}

interface PickerProps {
  readonly label: string;
  readonly chosen: Resource;
  readonly onChoose: (resource: Resource) => void;
}

/** Ряд из семи кнопок ресурсов; выбранная выделена. */
function Picker({ label, chosen, onChoose }: PickerProps) {
  return (
    <div>
      <div className="town-dim">{label}</div>
      <div className="town-controls">
        {RESOURCES.map((resource) => (
          <button
            key={resource}
            type="button"
            className={`town-button hud-resource-${resource}${resource === chosen ? " town-go" : ""}`}
            aria-pressed={resource === chosen}
            onClick={() => {
              onChoose(resource);
            }}
          >
            {RESOURCE_NAMES[resource]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Раздел «Рынок»: что отдаю, что хочу, курс и число сделок (72-market.md). */
export function TownMarket({ session, state, town }: TownMarketProps) {
  const [give, setGive] = useState<Resource>("gold");
  const [want, setWant] = useState<Resource>("wood");
  const [wanted, setWanted] = useState(1);
  const offer = marketOffer(state, town, give, want, wanted);
  const step = (delta: number) => () => {
    setWanted(offer.count + delta);
  };
  return (
    <section className="town-section">
      <h2 className="town-heading">Рынок</h2>
      <Picker label="Отдаю" chosen={give} onChoose={setGive} />
      <Picker label="Хочу" chosen={want} onChoose={setWant} />
      {offer.reason === null ? (
        <div className="town-chooser">
          <div>Курс: {offer.rate}</div>
          <div>
            {offer.deal} — сделок {offer.count} из {offer.max}
          </div>
          <div className="town-controls">
            <button type="button" className="town-button town-step" onClick={step(-10)}>
              −10
            </button>
            <button
              type="button"
              className="town-button town-step"
              aria-label="Меньше"
              onClick={step(-1)}
            >
              −
            </button>
            <button
              type="button"
              className="town-button town-step"
              aria-label="Больше"
              onClick={step(1)}
            >
              +
            </button>
            <button type="button" className="town-button town-step" onClick={step(10)}>
              +10
            </button>
            <button
              type="button"
              className="town-button town-go"
              onClick={() => {
                session.trade(give, want, offer.count);
              }}
            >
              Обменять
            </button>
          </div>
        </div>
      ) : (
        <div className="town-reason">{offer.reason}</div>
      )}
    </section>
  );
}
