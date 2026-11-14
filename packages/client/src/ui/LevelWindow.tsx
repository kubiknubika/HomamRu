import type { HeroState } from "@homamru/core";
import { useSyncExternalStore } from "react";
import { levelText, levelTitle, skillButton } from "../game/levelTexts.ts";
import type { Session } from "../game/session.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";

interface LevelWindowProps {
  readonly session: Session;
  /** Герой игрока, которому предложены навыки. */
  readonly hero: HeroState;
}

/**
 * Окно нового уровня: игрок выбирает один из предложенных навыков
 * (docs/mechanics/65-hero-skills.md). Кнопки «Закрыть» нет: без выбора игра не продолжается.
 */
export function LevelWindow({ session, hero }: LevelWindowProps) {
  const { levelUps } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return (
    <Dialog title={levelTitle(hero)}>
      <div className="dialog-text">{levelText(hero, levelUps)}</div>
      {hero.skillOffer.map((skill) => (
        <DialogButton
          key={skill}
          label={skillButton(hero, skill)}
          onClick={() => {
            session.chooseSkill(skill);
          }}
        />
      ))}
    </Dialog>
  );
}
