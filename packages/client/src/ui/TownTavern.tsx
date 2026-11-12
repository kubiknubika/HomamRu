import type { GameState, TownState } from "@homamru/core";
import { heroName } from "../game/captions.ts";
import type { Session } from "../game/session.ts";
import { armyText } from "../game/townTexts.ts";

interface TownTavernProps {
  readonly session: Session;
  readonly state: GameState;
  readonly town: TownState;
}

/** Раздел «Таверна»: два героя и наём, когда своего героя нет (32-hero-hire.md). */
export function TownTavern({ session, state, town }: TownTavernProps) {
  const player = state.players[town.owner];
  const hasHero = state.heroes.some((hero) => hero.owner === town.owner);
  const { price } = state.tavern;
  const lack = price - (player?.resources.gold ?? 0);
  return (
    <section className="town-section">
      <h2 className="town-heading">Таверна</h2>
      {hasHero && <div className="town-dim">У вас уже есть герой</div>}
      {(player?.tavern ?? []).map((offer, index) => {
        const kind = state.heroKinds.find((candidate) => candidate.id === offer.kind);
        return (
          <div key={offer.kind} className="town-row">
            <div className="town-row-text">
              <b>{heroName(state, offer.kind)}</b>
              <div className="town-dim">
                атака {kind?.attack ?? 0}, защита {kind?.defense ?? 0}
              </div>
              <div className="town-dim">армия: {armyText(state, offer.army)}</div>
              {!hasHero && lack > 0 && <div className="town-reason">не хватает: золото {lack}</div>}
            </div>
            {!hasHero && (
              <button
                type="button"
                className="town-button town-go"
                disabled={lack > 0}
                onClick={() => {
                  session.hireHero(index);
                }}
              >
                Нанять — {price} золота
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
