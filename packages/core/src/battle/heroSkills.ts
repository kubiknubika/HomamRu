/**
 * Числовые навыки героя в бою: «Нападение», «Защита», «Стрельба», «Баллистика» и магия.
 * Спецификация: docs/mechanics/65-hero-skills.md.
 */
export interface BattleHeroSkills {
  readonly spellPower: number;
  readonly mana: number;
  /** «Волшебство»: на сколько процентов больше урон заклинаний. */
  readonly sorcery: number;
  /** «Нападение»: на сколько процентов больше урон в ближнем бою и от ответного удара. */
  readonly offence?: number | undefined;
  /** «Защита»: на сколько процентов меньше урона по отрядам героя. */
  readonly armorer?: number | undefined;
  /** «Стрельба»: на сколько процентов больше урон выстрела. */
  readonly archery?: number | undefined;
  /** «Баллистика»: сколько лишних выстрелов у катапульты. */
  readonly ballistics?: number | undefined;
}
