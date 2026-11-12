/**
 * События партии. Описание: docs/mechanics/00-state-and-commands.md и документы механик.
 */
import type { TavernOffer } from "./tavernTypes.ts";
import type { ArmyStack } from "./types.ts";
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
  | {
      readonly type: "battleStarted";
      /** Нападающий герой. */
      readonly heroId: string;
      /** С кем бой: охранник, чужой герой, чужой город — что есть, то не `null`. */
      readonly guardId: string | null;
      readonly defenderHeroId: string | null;
      readonly townId: string | null;
    }
  /** Событие самого боя (этап 2), как есть. */
  | { readonly type: "battle"; readonly event: BattleEvent }
  | {
      readonly type: "battleFinished";
      readonly outcome: BattleOutcome;
      /** Потери героя по отрядам армии, по порядку. */
      readonly heroLosses: readonly StackLoss[];
      /** Сколько существ потерял обороняющийся, всего. */
      readonly guardLost: number;
      /** Потери обороняющегося по отрядам, по порядку. */
      readonly defenderLosses: readonly StackLoss[];
    }
  | { readonly type: "guardDefeated"; readonly objectId: string }
  | { readonly type: "heroDied"; readonly heroId: string; readonly reason: "destroyed" | "fled" }
  | {
      readonly type: "gameOver";
      readonly outcome: "defeat" | "victory";
      /** Победитель; при поражении единственного игрока — `null`. */
      readonly winner: number | null;
    }
  | {
      /** Гарнизон перед боем за город перешёл к герою, который в нём стоит. */
      readonly type: "garrisonJoined";
      readonly townId: string;
      readonly heroId: string;
      readonly army: readonly ArmyStack[];
    }
  | {
      readonly type: "townCaptured";
      readonly townId: string;
      readonly owner: number;
      readonly previousOwner: number;
      /** Был ли бой: пустой город захватывается без него. */
      readonly fought: boolean;
    }
  | {
      /** У игрока нет города: сколько своих ходов ему осталось закончить. */
      readonly type: "townlessCountdown";
      readonly player: number;
      readonly daysLeft: number;
    }
  | {
      readonly type: "playerEliminated";
      readonly player: number;
      /** Нет ни героя, ни города — или вышли семь дней без города. */
      readonly reason: "nothing" | "townless";
    }
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
      readonly type: "heroHired";
      readonly heroId: string;
      /** Идентификатор героя из файла героев. */
      readonly hero: string;
      readonly townId: string;
      readonly cost: number;
      readonly army: readonly ArmyStack[];
    }
  | {
      readonly type: "tavernChanged";
      readonly player: number;
      readonly offers: readonly TavernOffer[];
    }
  | {
      readonly type: "levelGained";
      readonly heroId: string;
      readonly level: number;
      readonly stat: "attack" | "defense";
    };
