import { guildSpells, learnableLevel } from "@homamru/core";
import type { GameState, TownState } from "@homamru/core";
import { heroSpellLine } from "../battle/battleSpells.ts";
import type { Session } from "../game/session.ts";
import { bookStatus } from "../game/townTexts.ts";

interface TownGuildProps {
  readonly session: Session;
  readonly state: GameState;
  readonly town: TownState;
}

/** Сколько кругов у гильдии: по уровню на круг, пятого нет (66-rare-resources.md). */
const CIRCLES = [1, 2, 3, 4] as const;

/**
 * Раздел «Гильдия магов»: её заклинания по кругам и покупка книги (64-magic-screen.md).
 * Круг, который герою города не по «Мудрости», помечен: выучить его он пока не может.
 */
export function TownGuild({ session, state, town }: TownGuildProps) {
  const known = guildSpells(state, town);
  const hero = state.heroes.find((candidate) => candidate.owner === town.owner);
  const book = bookStatus(state, town);
  return (
    <section className="town-section">
      <h2 className="town-heading">Гильдия магов</h2>
      {CIRCLES.map((circle) => {
        const spells = state.spells.filter(
          (spell) => spell.level === circle && known.includes(spell.id),
        );
        if (spells.length === 0) {
          return null;
        }
        const closed = hero !== undefined && circle > learnableLevel(hero);
        return (
          <div key={circle}>
            <div className="town-row-text">
              <b>Круг {circle}</b>
              {closed && <span className="town-reason"> — герою нужна «Мудрость»</span>}
            </div>
            {spells.map((spell) => (
              <div key={spell.id} className="town-dim">
                {heroSpellLine(spell, hero ?? { spellPower: 1, skills: [] })}
              </div>
            ))}
          </div>
        );
      })}
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
