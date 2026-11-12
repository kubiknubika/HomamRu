/** Идентификатор и дневной запас хода героя. Отдельно от game.ts: нужны и найму героя. */

/** Запас хода героя на день. */
export const DAILY_MOVEMENT = 1000;

const HERO_IDS = ["A", "B"] as const;

/** Идентификатор героя игрока: `A` у первого, `B` у второго. */
export function heroIdOf(player: number): string {
  return HERO_IDS[player] ?? `H${player}`;
}
