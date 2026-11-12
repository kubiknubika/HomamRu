/**
 * Создание боя: проверка описания и расстановка армий.
 * Спецификация: docs/mechanics/10-battle-field.md.
 */
import { createRng } from "../rng.ts";
import { BATTLE_WIDTH, cellIndex, inField } from "./hex.ts";
import { activateNext } from "./turns.ts";
import type { BattleDraft } from "./turns.ts";
import { BATTLE_VERSION, MAX_STACKS } from "./types.ts";
import type {
  ArmyDefinition,
  BattleDefinition,
  BattleEvent,
  BattleSide,
  BattleState,
  CreatureDefinition,
  StackState,
} from "./types.ts";

/** Ряды расстановки по числу отрядов в армии — как в Heroes 3. */
const PLACEMENT_ROWS: readonly (readonly number[])[] = [
  [],
  [5],
  [2, 8],
  [2, 5, 8],
  [0, 4, 6, 10],
  [0, 2, 5, 8, 10],
  [0, 2, 4, 6, 8, 10],
  [0, 2, 4, 5, 6, 8, 10],
];

const MAX_MORALE = 3;
const MAX_LUCK = 3;

interface BattleError {
  /** Место в описании боя, например `attacker.army[1].count`. */
  readonly field: string;
  readonly message: string;
}

export type CreateBattleResult =
  | { readonly ok: true; readonly state: BattleState; readonly events: readonly BattleEvent[] }
  | { readonly ok: false; readonly errors: readonly BattleError[] };

function isWhole(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validateArmy(
  name: string,
  army: ArmyDefinition,
  creatures: ReadonlyMap<string, CreatureDefinition>,
): BattleError[] {
  const errors: BattleError[] = [];
  if (army.army.length < 1 || army.army.length > MAX_STACKS) {
    errors.push({
      field: `${name}.army`,
      message: `В армии должно быть от 1 до ${MAX_STACKS} отрядов.`,
    });
  }
  for (const [index, entry] of army.army.entries()) {
    if (!creatures.has(entry.creature)) {
      errors.push({
        field: `${name}.army[${index}].creature`,
        message: `Существа «${entry.creature}» нет.`,
      });
    }
    if (!isWhole(entry.count, 1, Number.MAX_SAFE_INTEGER)) {
      errors.push({
        field: `${name}.army[${index}].count`,
        message: "Число существ — целое, не меньше 1.",
      });
    }
  }
  if (!isWhole(army.morale, -MAX_MORALE, MAX_MORALE)) {
    errors.push({ field: `${name}.morale`, message: "Боевой дух — целое от −3 до 3." });
  }
  if (!isWhole(army.luck, 0, MAX_LUCK)) {
    errors.push({ field: `${name}.luck`, message: "Удача — целое от 0 до 3." });
  }
  return errors;
}

function validateObstacles(definition: BattleDefinition): BattleError[] {
  const errors: BattleError[] = [];
  const seen = new Set<number>();
  for (const [index, cell] of definition.obstacles.entries()) {
    const field = `obstacles[${index}]`;
    if (!Number.isInteger(cell.col) || !Number.isInteger(cell.row) || !inField(cell)) {
      errors.push({ field, message: "Препятствие вне поля." });
    } else if (cell.col === 0 || cell.col === BATTLE_WIDTH - 1) {
      errors.push({ field, message: "Препятствие не может стоять в крайнем столбце: там армии." });
    } else if (seen.has(cellIndex(cell))) {
      errors.push({ field, message: "Два препятствия в одной клетке." });
    }
    seen.add(cellIndex(cell));
  }
  return errors;
}

function placeArmy(
  side: BattleSide,
  army: ArmyDefinition,
  creatures: ReadonlyMap<string, CreatureDefinition>,
): StackState[] {
  const rows = PLACEMENT_ROWS[army.army.length] ?? [];
  const stacks: StackState[] = [];
  for (const [slot, entry] of army.army.entries()) {
    const creature = creatures.get(entry.creature);
    const row = rows[slot];
    if (creature === undefined || row === undefined) {
      continue;
    }
    stacks.push({
      id: `${side === 0 ? "a" : "b"}${slot + 1}`,
      side,
      slot,
      creature,
      count: entry.count,
      initialCount: entry.count,
      firstHealth: creature.health,
      shots: creature.shots,
      col: side === 0 ? 0 : BATTLE_WIDTH - 1,
      row,
      turn: "ready",
      moraleUsed: false,
      retaliated: false,
      defendBonus: 0,
    });
  }
  return stacks;
}

/** Собирает неизменяемое состояние из рабочей копии. */
export function toState(draft: BattleDraft, obstacles: BattleState["obstacles"]): BattleState {
  return {
    version: BATTLE_VERSION,
    rng: draft.rng,
    round: draft.round,
    obstacles,
    sides: draft.sides,
    stacks: draft.stacks,
    activeStack: draft.activeStack,
    lastActedSide: draft.lastActedSide,
    result: draft.result,
  };
}

/**
 * Создаёт бой: расставляет армии и передаёт ход первому отряду.
 * Неверное описание — список причин.
 */
export function createBattle(
  definition: BattleDefinition,
  creatures: readonly CreatureDefinition[],
  seed: number,
): CreateBattleResult {
  const byId = new Map(creatures.map((creature) => [creature.id, creature]));
  const errors = [
    ...validateArmy("attacker", definition.attacker, byId),
    ...validateArmy("defender", definition.defender, byId),
    ...validateObstacles(definition),
  ];
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const draft: BattleDraft = {
    rng: createRng(seed),
    round: 1,
    sides: [
      {
        hero: definition.attacker.hero ?? null,
        morale: definition.attacker.morale,
        luck: definition.attacker.luck,
      },
      {
        hero: definition.defender.hero ?? null,
        morale: definition.defender.morale,
        luck: definition.defender.luck,
      },
    ],
    stacks: [
      ...placeArmy(0, definition.attacker, byId),
      ...placeArmy(1, definition.defender, byId),
    ],
    activeStack: null,
    // В начале боя преимущество у нападающего: считается, что последним ходил обороняющийся.
    lastActedSide: 1,
    result: null,
    events: [{ type: "roundStarted", round: 1 }],
  };
  activateNext(draft);
  return {
    ok: true,
    state: toState(
      draft,
      definition.obstacles.map((cell) => ({ col: cell.col, row: cell.row })),
    ),
    events: draft.events,
  };
}
