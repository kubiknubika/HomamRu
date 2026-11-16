import { experienceForLevel, formatSkills, MAX_LEVEL, maxMana } from "@homamru/core";
import type { GameState, HeroState } from "@homamru/core";
import { bookLine } from "../game/mapSpellTexts.ts";
import { creatureName, heroName } from "../game/captions.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";

interface HeroWindowProps {
  readonly state: GameState;
  readonly hero: HeroState;
  readonly onClose: () => void;
}

/**
 * Окно героя: уровень, опыт, характеристики, мана, навыки, книга, армия
 * (docs/mechanics/24-map-screen.md, 64-magic-screen.md, 65-hero-skills.md).
 */
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
        <div>Сила магии: {hero.spellPower}</div>
        <div>Знание: {hero.knowledge}</div>
        <div>
          Мана: {hero.mana} из {maxMana(hero)}
        </div>
      </div>
      <div className="dialog-text">
        <b>Навыки</b>
        {hero.skills.length === 0 && <div>Навыков нет</div>}
        {formatSkills(hero.skills).map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      <div className="dialog-text battle-journal">
        <b>Книга заклинаний</b>
        {!hero.book && <div>Книги нет</div>}
        {hero.book && hero.spells.length === 0 && <div>Заклинаний нет</div>}
        {hero.book &&
          state.spells
            .filter((spell) => hero.spells.includes(spell.id))
            .map((spell) => <div key={spell.id}>{bookLine(spell, hero)}</div>)}
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
