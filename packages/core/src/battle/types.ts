/**
 * Типы боя: описание, состояние, команды, события.
 * Спецификации: docs/mechanics/10-battle-field.md … 13-battle-damage.md.
 */
import type { RngState } from "../rng.ts";
import type { Cell } from "./hex.ts";

/** Номер версии формата состояния боя. */
export const BATTLE_VERSION = 1;

export const MAX_STACKS = 7;

/** Существо. Описание полей: docs/mechanics/14-creatures.md. */
export interface CreatureDefinition {
  readonly id: string;
  readonly name: string;
  readonly attack: number;
  readonly defense: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly health: number;
  readonly speed: number;
  readonly flying: boolean;
  /** Запас выстрелов; 0 — существо не стрелок. */
  readonly shots: number;
}

interface BattleHero {
  readonly attack: number;
  readonly defense: number;
}

export interface ArmyDefinition {
  readonly hero?: BattleHero | undefined;
  readonly morale: number;
  readonly luck: number;
  readonly army: readonly { readonly creature: string; readonly count: number }[];
}

/** Описание боя до его начала: то же, что в файле боя. */
export interface BattleDefinition {
  readonly id: string;
  readonly name: string;
  readonly obstacles: readonly Cell[];
  readonly attacker: ArmyDefinition;
  readonly defender: ArmyDefinition;
}

/** Сторона боя: 0 — нападающий, 1 — обороняющийся. */
export type BattleSide = 0 | 1;

/**
 * Что отряду осталось в этом раунде:
 * `ready` — ещё не ходил; `waiting` — ждёт третьей части раунда;
 * `waitingAfterMorale` — ждёт второй части; `done` — ходить больше не будет.
 */
export type StackTurn = "ready" | "waiting" | "waitingAfterMorale" | "done";

export interface StackState {
  /** `a1`, `a2`… у нападающего, `b1`, `b2`… у обороняющегося — по порядку в армии. */
  readonly id: string;
  readonly side: BattleSide;
  /** Место в армии с нуля. */
  readonly slot: number;
  /** Существо целиком: состояние боя не зависит от файлов. */
  readonly creature: CreatureDefinition;
  /** Сколько существ сейчас; 0 — отряд погиб. */
  readonly count: number;
  readonly initialCount: number;
  /** Здоровье первого существа; у остальных оно полное. */
  readonly firstHealth: number;
  readonly shots: number;
  readonly col: number;
  readonly row: number;
  readonly turn: StackTurn;
  /** Уже получал второй ход от боевого духа в этом раунде. */
  readonly moraleUsed: boolean;
  /** Уже отвечал на удар в этом раунде. */
  readonly retaliated: boolean;
  /** Прибавка к защите от «защищаться»; 0 — не действует. */
  readonly defendBonus: number;
}

export interface BattleSideState {
  readonly hero: BattleHero | null;
  readonly morale: number;
  readonly luck: number;
}

export type BattleEndReason = "destroyed" | "fled";

export interface BattleResult {
  readonly winner: BattleSide;
  readonly reason: BattleEndReason;
  /** Потери каждого отряда обеих сторон. */
  readonly losses: readonly { readonly stackId: string; readonly lost: number }[];
}

export interface BattleState {
  readonly version: number;
  readonly rng: RngState;
  readonly round: number;
  readonly obstacles: readonly Cell[];
  readonly sides: readonly [BattleSideState, BattleSideState];
  readonly stacks: readonly StackState[];
  /** Отряд, чей сейчас ход; `null`, когда бой окончен. */
  readonly activeStack: string | null;
  /** Сторона, ходившая последней: при равной скорости ходит другая. */
  readonly lastActedSide: BattleSide;
  readonly result: BattleResult | null;
}

export type BattleCommand =
  | { readonly type: "battleMove"; readonly side: BattleSide; readonly to: Cell }
  | {
      readonly type: "battleAttack";
      readonly side: BattleSide;
      readonly target: string;
      /** Клетка, с которой наносится удар. */
      readonly from: Cell;
    }
  | { readonly type: "battleShoot"; readonly side: BattleSide; readonly target: string }
  | { readonly type: "battleWait"; readonly side: BattleSide }
  | { readonly type: "battleDefend"; readonly side: BattleSide }
  | { readonly type: "battleFlee"; readonly side: BattleSide };

export type StrikeKind = "melee" | "retaliation" | "shot";

export type BattleEvent =
  | { readonly type: "roundStarted"; readonly round: number }
  | { readonly type: "stackTurn"; readonly stackId: string }
  | { readonly type: "stackFroze"; readonly stackId: string }
  | {
      readonly type: "stackMoved";
      readonly stackId: string;
      readonly from: Cell;
      readonly to: Cell;
    }
  | {
      readonly type: "strike";
      readonly kind: StrikeKind;
      readonly attackerId: string;
      readonly targetId: string;
      readonly damage: number;
      readonly killed: number;
      readonly left: number;
      readonly lucky: boolean;
    }
  | { readonly type: "stackDied"; readonly stackId: string }
  | { readonly type: "stackWaits"; readonly stackId: string }
  | { readonly type: "stackDefends"; readonly stackId: string; readonly bonus: number }
  | { readonly type: "moraleTurn"; readonly stackId: string }
  | { readonly type: "sideFled"; readonly side: BattleSide }
  | { readonly type: "battleEnded"; readonly result: BattleResult };

/** Коды отказа команд боя: docs/mechanics/12-battle-actions.md. */
export const BATTLE_REJECT_CODES = [
  "BATTLE_OVER",
  "NOT_YOUR_STACK",
  "CELL_UNREACHABLE",
  "UNKNOWN_TARGET",
  "TARGET_IS_ALLY",
  "NOT_ADJACENT",
  "NOT_A_SHOOTER",
  "NO_SHOTS",
  "ENEMY_ADJACENT",
  "ALREADY_WAITED",
  "NO_HERO",
] as const;

export type BattleRejectCode = (typeof BATTLE_REJECT_CODES)[number];

export type BattleCommandResult =
  | { readonly ok: true; readonly state: BattleState; readonly events: readonly BattleEvent[] }
  | { readonly ok: false; readonly code: BattleRejectCode; readonly message: string };
