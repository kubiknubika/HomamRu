export { applyCommand, replay } from "./commands.ts";
export type { ReplayResult } from "./commands.ts";
export { createGame, DAILY_MOVEMENT, heroIdOf } from "./game.ts";
export type { CreateGameResult } from "./game.ts";
export { cellsAlong, MAX_PLAYERS, TERRAIN_LAND, TERRAIN_OBSTACLE, validateMap } from "./map.ts";
export type { MapError } from "./map.ts";
export { findPath } from "./pathfinding.ts";
export type { PathResult } from "./pathfinding.ts";
export { formatEvent, renderState } from "./render.ts";
export { createRng, nextFloat, nextInt, nextUint32 } from "./rng.ts";
export type { RngResult, RngState } from "./rng.ts";
export { calendarOf } from "./time.ts";
export { incomeOf, objectAt } from "./objects.ts";
export { DIRECTIONS, MINE_KINDS, REJECT_CODES, RESOURCES, STATE_VERSION } from "./types.ts";
export type {
  Command,
  CommandRejected,
  CommandResult,
  Direction,
  GameEvent,
  GameState,
  HeroState,
  MapDefinition,
  MapObjectDefinition,
  ObjectState,
  Position,
  RejectCode,
  Resource,
  Resources,
} from "./types.ts";
export { applyBattleCommand, replayBattle } from "./battle/commands.ts";
export type { BattleReplayResult } from "./battle/commands.ts";
export { createBattle } from "./battle/create.ts";
export { damageRange } from "./battle/damage.ts";
export { turnQueue } from "./battle/turns.ts";
export type { CreateBattleResult } from "./battle/create.ts";
export { BATTLE_HEIGHT, BATTLE_WIDTH, distance, neighbours } from "./battle/hex.ts";
export type { Cell } from "./battle/hex.ts";
export {
  activeStackOf,
  attackCells,
  canShoot,
  findStack,
  reachableCells,
  walkSteps,
} from "./battle/queries.ts";
export { formatBattleEvent, renderBattle } from "./battle/render.ts";
export { BATTLE_REJECT_CODES, BATTLE_VERSION } from "./battle/types.ts";
export type {
  ArmyDefinition,
  BattleCommand,
  BattleCommandResult,
  BattleDefinition,
  BattleEvent,
  BattleRejectCode,
  BattleResult,
  BattleSide,
  BattleState,
  CreatureDefinition,
  StackState,
} from "./battle/types.ts";
export { chooseBattleCommand } from "./battle/ai.ts";
export { randomBattle, runAutoBattle } from "./battle/autobattle.ts";
