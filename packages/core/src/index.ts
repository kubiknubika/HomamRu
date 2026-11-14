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
export { incomeOf, MINE_INCOME, objectAt } from "./objects.ts";
export { TAVERN_OFFERS } from "./tavern.ts";
export type {
  GameContent,
  HeroKind,
  HireHeroCommand,
  OpponentRules,
  TavernOffer,
  TavernRules,
} from "./tavernTypes.ts";
export {
  buildObstacle,
  missingResources,
  TOWN_BASE_INCOME,
  townIncome,
  townOf,
  weeklyGrowth,
} from "./town.ts";
export {
  GUARD_MAX_COUNT,
  guardWatching,
  POWER_PER_CREATURE,
  QUANTITY_SCALE,
  quantityRange,
  quantityWord,
} from "./guards.ts";
export { MAX_STACKS } from "./battle/types.ts";
export { guardBattleCommand, playBattleOut } from "./battleAuto.ts";
export { chooseMapCommand, computerCommand } from "./opponent.ts";
export { playComputerGame, TURN_COMMAND_LIMIT } from "./opponentGame.ts";
export type { ComputerGame } from "./opponentGame.ts";
export { armyValue } from "./opponentTown.ts";
export type { BattlePlayedOut } from "./battleAuto.ts";
export { experienceForLevel, levelOf, MAX_LEVEL } from "./hero.ts";
export type { BattleOutcome, StackLoss } from "./events.ts";
export { DIRECTIONS, MINE_KINDS, REJECT_CODES, RESOURCES, STATE_VERSION } from "./types.ts";
export type {
  Command,
  CommandRejected,
  CommandResult,
  Direction,
  GameEvent,
  GameState,
  ArmyStack,
  BuildingDefinition,
  GuardState,
  HeroState,
  MapBattle,
  MapDefinition,
  MapObjectDefinition,
  ObjectState,
  Position,
  RejectCode,
  ResourceAmounts,
  Resource,
  Resources,
  TownCommand,
  TownState,
} from "./types.ts";
export { applyBattleCommand, replayBattle } from "./battle/commands.ts";
export type { BattleReplayResult } from "./battle/commands.ts";
export { createBattle } from "./battle/create.ts";
export { damageRange, defenseOf } from "./battle/damage.ts";
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
export {
  GATE_BRIDGE,
  GATE_INNER,
  GATE_OUTER,
  gateOpen,
  hasWallPenalty,
  isMachine,
  isMoat,
  MOAT_DAMAGE,
  MOAT_DEFENSE,
  wallCells,
  wallPartCell,
} from "./battle/siege.ts";
export type { SiegeState, Tower, WallPart } from "./battle/siege.ts";
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
export { TOWNLESS_DAYS } from "./players.ts";
export { townsOf } from "./opponentTown.ts";
