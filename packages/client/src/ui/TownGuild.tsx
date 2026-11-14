import { guildSpells } from "@homamru/core";
import type { GameState, TownState } from "@homamru/core";
import { spellLine } from "../battle/battleSpells.ts";
import type { Session } from "../game/session.ts";
import { bookStatus } from "../game/townTexts.ts";

interface TownGuildProps {
  readonly session: Session;
  readonly state: GameState;
  readonly town: TownState;
}

/** Раздел «Гильдия магов»: её заклинания и покупка книги (64-magic-screen.md). */
export function TownGuild({ session, state, town }: TownGuildProps) {
  const known = guildSpells(state, town);
  const hero = state.heroes.find((candidate) => candidate.owner === town.owner);
  const book = bookStatus(state, town);
  return (
    <section className="town-section">
      <h2 className="town-heading">Гильдия магов</h2>
      {state.spells
        .filter((spell) => known.includes(spell.id))
        .map((spell) => (
          <div key={spell.id} className="town-dim">
            {spellLine(spell, hero?.spellPower ?? 1)}
          </div>
        ))}
      <div className="town-row">
        <div className="town-row-text">
          <b>Книга заклинаний</b>
          {book.kind === "text" && <div className="town-reason">{book.text}</div>}
        </div>
        {book.kind === "buy" && (
          <button type="button" className="town-button town-go" onClick={session.buyBook}>
            Купить книгу — {book.price} золота
          </button>
        )}
      </div>
    </section>
  );
}
