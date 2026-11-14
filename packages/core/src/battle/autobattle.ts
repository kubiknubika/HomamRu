/**
 * Автобой: бой двух компьютеров. Спецификация: docs/mechanics/15-battle-ai.md.
 */
import { createRng, nextInt } from "../rng.ts";
import type { RngState } from "../rng.ts";
import { chooseBattleCommand } from "./ai.ts";
import { applyBattleCommand } from "./commands.ts";
import { createBattle } from "./create.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, cellIndex } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { battleProblems, eventProblems } from "./invariants.ts";
import { FORTIFICATIONS } from "./siege.ts";
import { MAX_STACKS } from "./types.ts";
import type {
  ArmyDefinition,
  BattleCommand,
  BattleDefinition,
  BattleState,
  CreatureDefinition,
} from "./types.ts";

/** Страховка автобоёв: бой двух компьютеров обязан закончиться раньше. Не правило игры. */
export const AUTO_BATTLE_MAX_ROUNDS = 200;

export interface AutoBattleRun {
  /** Состояние в конце; `null`, если бой не удалось создать. */
  readonly state: BattleState | null;
  readonly commands: readonly BattleCommand[];
  /** Что пошло не так; пустой список — автобой прошёл. */
  readonly problems: readonly string[];
}

/** Проводит бой двух компьютеров и после каждой команды проверяет свойства боя. */
export function runAutoBattle(
  definition: BattleDefinition,
  creatures: readonly CreatureDefinition[],
  seed: number,
  choose: (state: BattleState) => BattleCommand | undefined = chooseBattleCommand,
): AutoBattleRun {
  const created = createBattle(definition, creatures, seed);
  if (!created.ok) {
    const problems = created.errors.map((error) => `${error.field}: ${error.message}`);
    return { state: null, commands: [], problems };
  }
  let { state } = created;
  const commands: BattleCommand[] = [];
  const problems = battleProblems(state);
  while (state.result === null && problems.length === 0) {
    if (state.round > AUTO_BATTLE_MAX_ROUNDS) {
      problems.push(`бой не закончился за ${AUTO_BATTLE_MAX_ROUNDS} раундов`);
      break;
    }
    const command = choose(state);
    if (command === undefined) {
      problems.push("компьютер не выбрал команду");
      break;
    }
    const result = applyBattleCommand(state, command);
    if (!result.ok) {
      problems.push(`команда компьютера ${command.type} отклонена: ${result.code}`);
      break;
    }
    commands.push(command);
    problems.push(...eventProblems(state, result.events), ...battleProblems(result.state));
    state = result.state;
  }
  return { state, commands, problems };
}

const SIEGE_BUILDINGS = 8;

/** Случайная осада: армии те же, что у случайного боя; укрепление и число зданий — по сиду. */
export function randomSiege(
  seed: number,
  creatures: readonly CreatureDefinition[],
): BattleDefinition {
  const fortification = FORTIFICATIONS[seed % FORTIFICATIONS.length] ?? "fort";
  return {
    ...randomBattle(seed, creatures),
    obstacles: [],
    siege: { fortification, buildings: seed % SIEGE_BUILDINGS },
  };
}

const MAX_COUNT = 40;
const MAX_HERO_STAT = 5;
const MAX_OBSTACLES = 8;

/** Случайное описание боя для автобоёв: по одному и тому же сиду — одно и то же. */
export function randomBattle(
  seed: number,
  creatures: readonly CreatureDefinition[],
): BattleDefinition {
  let rng: RngState = createRng(seed);
  const roll = (min: number, max: number): number => {
    const result = nextInt(rng, min, max);
    rng = result.rng;
    return result.value;
  };
  const randomArmy = (): ArmyDefinition => {
    const army = Array.from({ length: roll(1, MAX_STACKS) }, () => ({
      creature: creatures[roll(0, creatures.length - 1)]?.id ?? "",
      count: roll(1, MAX_COUNT),
    }));
    const hero =
      roll(0, 1) === 1
        ? { attack: roll(0, MAX_HERO_STAT), defense: roll(0, MAX_HERO_STAT) }
        : undefined;
    return { hero, morale: roll(-3, 3), luck: roll(0, 3), army };
  };
  const attacker = randomArmy();
  const defender = randomArmy();
  const obstacles = new Map<number, Cell>();
  const wanted = roll(0, MAX_OBSTACLES);
  for (let i = 0; i < wanted; i += 1) {
    // Крайние столбцы заняты армиями.
    const cell = { col: roll(1, BATTLE_WIDTH - 2), row: roll(0, BATTLE_HEIGHT - 1) };
    obstacles.set(cellIndex(cell), cell);
  }
  return {
    id: `auto-${seed}`,
    name: `Автобой ${seed}`,
    obstacles: [...obstacles.values()],
    attacker,
    defender,
  };
}
