/**
 * События партии. Описание: docs/mechanics/00-state-and-commands.md и документы механик.
 */
import type { BattleEvent } from "./battle/types.ts";
import type { Position, Resource, ResourceAmounts, Resources } from "./types.ts";

interface HeroSteppedEvent {
  readonly type: "heroStepped";
  readonly heroId: string;
  readonly from: Position;
  readonly to: Position;
  readonly cost: number;
  readonly movementLeft: number;
}

interface TurnEndedEvent {
  readonly type: "turnEnded";
  readonly player: number;
}

interface DayStartedEvent {
  readonly type: "dayStarted";
  readonly day: number;
  readonly month: number;
  readonly week: number;
  readonly weekday: number;
}

interface PilePickedEvent {
  readonly type: "pilePicked";
  readonly objectId: string;
  readonly player: number;
  readonly resource: Resource;
  readonly amount: number;
}

interface MineCapturedEvent {
  readonly type: "mineCaptured";
  readonly objectId: string;
  readonly owner: number;
  readonly previousOwner: number | null;
}

interface IncomeReceivedEvent {
  readonly type: "incomeReceived";
  readonly player: number;
  readonly income: Resources;
}

/** Потери одного отряда героя в бою. */
export interface StackLoss {
  readonly creature: string;
  readonly lost: number;
}

export type BattleOutcome = "won" | "lost" | "fled";

export type GameEvent =
  | HeroSteppedEvent
  | TurnEndedEvent
  | DayStartedEvent
  | PilePickedEvent
  | MineCapturedEvent
  | IncomeReceivedEvent
  | {
      readonly type: "guardGrew";
      readonly objectId: string;
      readonly from: number;
      readonly to: number;
    }
  | { readonly type: "battleStarted"; readonly heroId: string; readonly guardId: string }
  /** Событие самого боя (этап 2), как есть. */
  | { readonly type: "battle"; readonly event: BattleEvent }
  | {
      readonly type: "battleFinished";
      readonly outcome: BattleOutcome;
      /** Потери героя по отрядам армии, по порядку. */
      readonly heroLosses: readonly StackLoss[];
      readonly guardLost: number;
    }
  | { readonly type: "guardDefeated"; readonly objectId: string }
  | { readonly type: "heroDied"; readonly heroId: string; readonly reason: "destroyed" | "fled" }
  | { readonly type: "gameOver"; readonly outcome: "defeat" }
  | {
      readonly type: "experienceGained";
      readonly heroId: string;
      readonly amount: number;
      readonly total: number;
    }
  | {
      readonly type: "buildingBuilt";
      readonly townId: string;
      readonly building: string;
      /** Сколько заплачено. */
      readonly spent: ResourceAmounts;
    }
  | {
      readonly type: "creaturesGrew";
      readonly townId: string;
      readonly creature: string;
      readonly added: number;
      readonly available: number;
    }
  | {
      readonly type: "creaturesRecruited";
      readonly townId: string;
      readonly creature: string;
      readonly count: number;
      readonly cost: number;
    }
  | {
      readonly type: "creaturesTransferred";
      readonly townId: string;
      readonly heroId: string;
      readonly from: "garrison" | "hero";
      readonly creature: string;
      readonly count: number;
    }
  | {
      readonly type: "levelGained";
      readonly heroId: string;
      readonly level: number;
      readonly stat: "attack" | "defense";
    };
