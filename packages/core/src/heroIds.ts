/** Идентификатор и дневной запас хода героя. Отдельно от game.ts: нужны и найму героя. */
import { dailyMovementOf } from "./skills.ts";
import type { HeroSkill } from "./skills.ts";

/** Запас хода героя на день без «Логистики». */
export const DAILY_MOVEMENT = 1000;

/** Дневной запас хода героя: 1000 и больше с «Логистикой» (65-hero-skills.md). */
export function movementFor(skills: readonly HeroSkill[]): number {
  return dailyMovementOf({ skills }, DAILY_MOVEMENT);
}

const HERO_IDS = ["A", "B"] as const;

/** Идентификатор героя игрока: `A` у первого, `B` у второго. */
export function heroIdOf(player: number): string {
  return HERO_IDS[player] ?? `H${player}`;
}
