import type { BattleState } from "@homamru/core";
import { useState } from "react";
import { bookButton, spellLine } from "../battle/battleSpells.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";

interface BattleBookProps {
  readonly state: BattleState;
  readonly side: 0 | 1;
  /** Сейчас ход отряда игрока и показ событий закончен. */
  readonly myTurn: boolean;
  /** Игрок выбрал заклинание: дальше он выбирает цель на поле. */
  readonly onChoose: (spell: string) => void;
}

/**
 * Кнопка «Книга» с маной героя и окно со списком заклинаний
 * (docs/mechanics/64-magic-screen.md). Кнопки нет, если колдовать некому.
 */
export function BattleBook({ state, side, myTurn, onChoose }: BattleBookProps) {
  const [open, setOpen] = useState(false);
  const button = bookButton(state, side, myTurn);
  const hero = state.sides[side].hero;
  if (button === null || hero === null) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        className="battle-button battle-book"
        disabled={button.reason !== null}
        title={button.reason ?? undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        Книга {button.mana}
        {button.reason !== null && <span className="battle-book-reason">{button.reason}</span>}
      </button>
      {open && (
        <Dialog title={`Книга заклинаний — мана ${hero.mana}`}>
          <div className="dialog-text battle-journal">
            {hero.spells.map((spell) => (
              <button
                key={spell.id}
                type="button"
                className="spell-row"
                disabled={spell.cost > hero.mana}
                onClick={() => {
                  setOpen(false);
                  onChoose(spell.id);
                }}
              >
                {spellLine(spell, hero.spellPower)}
              </button>
            ))}
          </div>
          <DialogButton
            label="Закрыть"
            onClick={() => {
              setOpen(false);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
