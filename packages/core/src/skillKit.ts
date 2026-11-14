/** Помощники тестов навыков героя (65-hero-skills.md). В игре не используются. */
import { playBattleOut } from "./battleAuto.ts";
import { applyCommand } from "./commands.ts";
import type { SkillId } from "./skills.ts";
import { gameWith, OPEN_FIELD } from "./testkit.ts";
import type { Command, CommandResult, GameState, HeroState } from "./types.ts";

export const TO_ZONE: Command = { type: "moveHero", player: 0, heroId: "A", path: ["E", "E", "E"] };
export const END: Command = { type: "endTurn", player: 0 };

export function heroOf(state: GameState): HeroState {
  const [hero] = state.heroes;
  if (hero === undefined) {
    throw new Error("Героя нет.");
  }
  return hero;
}

/** Герой с 400 соколами победил охранника из `count` ополченцев: опыт — 12 за каждого. */
export function afterVictory(count: number, seed = 1): GameState {
  const initial = gameWith(
    OPEN_FIELD,
    [{ type: "guard", x: 4, y: 0, creature: "militia", count }],
    { army: ["falcon:400"], seed },
  );
  const moved = applyCommand(initial, TO_ZONE);
  if (!moved.ok) {
    throw new Error(moved.message);
  }
  return playBattleOut(moved.state).state;
}

export function choose(state: GameState, skill: SkillId): CommandResult {
  return applyCommand(state, { type: "chooseSkill", player: 0, heroId: "A", skill });
}

/** Состояние после выбора навыка; отказ — исключение. */
export function chosen(state: GameState, skill: SkillId): GameState {
  const result = choose(state, skill);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.state;
}
