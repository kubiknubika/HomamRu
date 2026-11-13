/**
 * Помощники для тестов боя. В игре не используются.
 */
import { applyBattleCommand } from "./commands.ts";
import { createBattle } from "./create.ts";
import type { Cell } from "./hex.ts";
import { activeStackOf, findStack } from "./queries.ts";
import type {
  ArmyDefinition,
  BattleCommand,
  BattleDefinition,
  BattleEvent,
  BattleState,
  CreatureDefinition,
  StackState,
} from "./types.ts";

/** Существа из docs/mechanics/14-creatures.md. */
export const MILITIA: CreatureDefinition = {
  id: "militia",
  name: "Ополченец",
  attack: 5,
  defense: 5,
  damageMin: 2,
  damageMax: 3,
  health: 12,
  speed: 4,
  flying: false,
  shots: 0,
  price: 60,
  growth: 14,
};

export const SLINGER: CreatureDefinition = {
  id: "slinger",
  name: "Пращник",
  attack: 5,
  defense: 3,
  damageMin: 1,
  damageMax: 4,
  health: 9,
  speed: 5,
  flying: false,
  shots: 10,
  price: 100,
  growth: 9,
};

export const FALCON: CreatureDefinition = {
  id: "falcon",
  name: "Сокол",
  attack: 7,
  defense: 5,
  damageMin: 3,
  damageMax: 5,
  health: 18,
  speed: 8,
  flying: true,
  shots: 0,
  price: 200,
  growth: 7,
};

const ARMSMAN: CreatureDefinition = {
  id: "armsman",
  name: "Латник",
  attack: 9,
  defense: 11,
  damageMin: 5,
  damageMax: 8,
  health: 32,
  speed: 5,
  flying: false,
  shots: 0,
  price: 300,
  growth: 4,
};

export const CREATURES = [MILITIA, SLINGER, FALCON, ARMSMAN];

/** Армия без героя, с нулевыми боевым духом и удачей. Запись отряда: `"militia:20"`. */
export function army(
  stacks: readonly string[],
  changes: Partial<ArmyDefinition> = {},
): ArmyDefinition {
  return {
    morale: 0,
    luck: 0,
    army: stacks.map((entry) => {
      const [creature = "", count = "1"] = entry.split(":");
      return { creature, count: Number(count) };
    }),
    ...changes,
  };
}

interface Started {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}

/** Создаёт бой; неверное описание — исключение. */
export function startBattle(
  attacker: ArmyDefinition,
  defender: ArmyDefinition,
  options: {
    readonly seed?: number;
    readonly obstacles?: readonly Cell[];
    readonly siege?: BattleDefinition["siege"];
  } = {},
): Started {
  const created = createBattle(
    {
      id: "test",
      name: "Проверка",
      obstacles: options.obstacles ?? [],
      siege: options.siege,
      attacker,
      defender,
    },
    CREATURES,
    options.seed ?? 1,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => `${error.field}: ${error.message}`).join("\n"));
  }
  return created;
}

/** Меняет отряды в состоянии: тестам нужно ставить их в нужные клетки. */
export function withStacks(
  state: BattleState,
  changes: Readonly<Record<string, Partial<StackState>>>,
): BattleState {
  return {
    ...state,
    stacks: state.stacks.map((entry) => ({ ...entry, ...changes[entry.id] })),
  };
}

/** Существо с одинаковым уроном «от» и «до»: броски не зависят от случая. */
export function fixed(
  creature: CreatureDefinition,
  damage: number,
  changes: Partial<CreatureDefinition> = {},
): CreatureDefinition {
  return { ...creature, damageMin: damage, damageMax: damage, ...changes };
}

type WithoutSide<C> = C extends unknown ? Omit<C, "side"> : never;

/** Применяет команду от стороны, чей ход; отказ — исключение. */
export function act(
  state: BattleState,
  command: WithoutSide<BattleCommand>,
): { state: BattleState; events: readonly BattleEvent[] } {
  const side = activeStackOf(state)?.side ?? 0;
  const result = applyBattleCommand(state, { ...command, side } as BattleCommand);
  if (!result.ok) {
    throw new Error(`Отказ ${result.code}: ${result.message}`);
  }
  return result;
}

export function stack(state: BattleState, id: string): StackState {
  const found = findStack(state, id);
  if (found === undefined) {
    throw new Error(`Нет отряда ${id}.`);
  }
  return found;
}

/** Отдаёт ход отряду: тесты меняют скорости уже после начала боя. */
export function turnOf(state: BattleState, id: string): BattleState {
  return { ...state, activeStack: id };
}

export function strikes(events: readonly BattleEvent[]) {
  return events.filter((event) => event.type === "strike");
}

/** Код отказа команды или «принята». */
export function code(state: BattleState, command: BattleCommand): string {
  const result = applyBattleCommand(state, command);
  return result.ok ? "принята" : result.code;
}
