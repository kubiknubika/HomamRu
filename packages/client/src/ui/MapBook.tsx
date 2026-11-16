import { useState } from "react";
import type { GameState, HeroState } from "@homamru/core";
import { mapSpellRows } from "../game/mapSpellTexts.ts";
import type { Session } from "../game/session.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";

interface MapBookProps {
  readonly session: Session;
  readonly state: GameState;
  readonly hero: HeroState;
  readonly onClose: () => void;
}

/** Окно «Колдовать»: заклинания карты героя (docs/mechanics/73-map-spells.md). */
export function MapBook({ session, state, hero, onClose }: MapBookProps) {
  /** Заклинание, для которого игрок выбирает город. */
  const [choosing, setChoosing] = useState<string | null>(null);
  const rows = mapSpellRows(state, hero);
  const chosen = rows.find((row) => row.id === choosing);
  const cast = (spell: string, townId?: string): void => {
    session.castMap(spell, townId);
    onClose();
  };
  if (chosen !== undefined) {
    return (
      <Dialog title="Городской портал: куда">
        {chosen.towns.map((town) => (
          <DialogButton
            key={town.id}
            label={`Город, клетка ${town.x + 1}:${town.y + 1}`}
            onClick={() => {
              cast(chosen.id, town.id);
            }}
          />
        ))}
        <DialogButton
          label="Назад"
          onClick={() => {
            setChoosing(null);
          }}
        />
      </Dialog>
    );
  }
  return (
    <Dialog title={`Колдовать — мана ${hero.mana}`}>
      {rows.map((row) => (
        <div key={row.id} className="dialog-text">
          <button
            type="button"
            className="dialog-button"
            disabled={row.reason !== null}
            onClick={() => {
              if (row.towns.length > 0) {
                setChoosing(row.id);
              } else {
                cast(row.id);
              }
            }}
          >
            {row.line}
          </button>
          {row.reason !== null && <div className="town-reason">{row.reason}</div>}
        </div>
      ))}
      <DialogButton label="Закрыть" onClick={onClose} />
    </Dialog>
  );
}
