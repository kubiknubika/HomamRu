import { experienceForLevel, MAX_LEVEL } from "@homamru/core";
import type { GameState, HeroState } from "@homamru/core";
import { creatureName, heroName } from "../game/captions.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";

interface HeroWindowProps {
  readonly state: GameState;
  readonly hero: HeroState;
  readonly onClose: () => void;
}

/** Окно героя: уровень, опыт, атака, защита, армия (docs/mechanics/24-map-screen.md). */
export function HeroWindow({ state, hero, onClose }: HeroWindowProps) {
  const next = hero.level >= MAX_LEVEL ? undefined : experienceForLevel(hero.level + 1);
  const left = next === undefined ? null : next - hero.experience;
  return (
    <Dialog title={`Герой: ${heroName(state, hero.kind)}`}>
      <div className="dialog-text">
        <div>Уровень: {hero.level}</div>
        <div>Опыт: {hero.experience}</div>
        <div>{left === null ? "Уровень наибольший" : `До следующего уровня: ${left}`}</div>
        <div>Атака: {hero.attack}</div>
        <div>Защита: {hero.defense}</div>
      </div>
      <div className="dialog-text">
        <b>Армия</b>
        {hero.army.map((stack, index) => (
          // Отряды армии различаются только местом в списке.
          // oxlint-disable-next-line react/no-array-index-key
          <div key={index}>
            {creatureName(state, stack.creature)}: {stack.count}
          </div>
        ))}
      </div>
      <DialogButton label="Закрыть" onClick={onClose} />
    </Dialog>
  );
}
