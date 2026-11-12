/**
 * Типы игрового состояния, команд и событий.
 * Спецификация: docs/mechanics/00-state-and-commands.md.
 */
import type { RngState } from "./rng.ts";

/** Номер версии формата состояния. Увеличивается при любом изменении формата. */
export const STATE_VERSION = 2;

/** Направления шага в порядке из спецификации перемещения. */
export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface Position {
  readonly x: number;
  readonly y: number;
}

/** Виды ресурсов по порядку показа. Спецификация: docs/mechanics/20-map-objects.md. */
export const RESOURCES = ["gold", "wood", "ore"] as const;
export type Resource = (typeof RESOURCES)[number];
export type Resources = Readonly<Record<Resource, number>>;
/** Часть запаса: чего не названо — ноль. */
export type ResourceAmounts = { readonly [K in Resource]?: number | undefined };

/** Виды шахт. */
export const MINE_KINDS = ["sawmill", "ore-pit", "gold-mine"] as const;
export type MineKind = (typeof MINE_KINDS)[number];

/** Объект в файле карты. */
export type MapObjectDefinition =
  | {
      readonly type: "pile";
      readonly x: number;
      readonly y: number;
      readonly resource: Resource;
      /** Если не задано — выбирается случайно при создании партии. */
      readonly amount?: number | undefined;
    }
  | { readonly type: "mine"; readonly x: number; readonly y: number; readonly kind: MineKind };

/** Описание карты до начала партии: то же, что в файле карты. */
export interface MapDefinition {
  readonly id: string;
  readonly name: string;
  /** Строки карты сверху вниз; каждый символ — одна клетка. */
  readonly terrain: readonly string[];
  /** Игроки по порядку хода. */
  readonly players: readonly {
    readonly hero: Position;
    /** Начальный запас; чего нет — ноль. */
    readonly resources?: ResourceAmounts | undefined;
  }[];
  /** Объекты карты по порядку; порядок задаёт их идентификаторы. */
  readonly objects?: readonly MapObjectDefinition[] | undefined;
}

export interface MapState {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly string[];
}

interface PlayerState {
  /** Номер игрока с нуля; совпадает с местом в списке игроков. */
  readonly id: number;
  readonly resources: Resources;
}

interface PileState {
  readonly id: string;
  readonly type: "pile";
  readonly x: number;
  readonly y: number;
  readonly resource: Resource;
  readonly amount: number;
}

interface MineState {
  readonly id: string;
  readonly type: "mine";
  readonly x: number;
  readonly y: number;
  readonly kind: MineKind;
  /** Номер игрока-владельца; `null` — шахта ничья. */
  readonly owner: number | null;
}

export type ObjectState = PileState | MineState;

export interface HeroState {
  readonly id: string;
  /** Номер игрока-владельца. */
  readonly owner: number;
  readonly x: number;
  readonly y: number;
  /** Остаток запаса хода на сегодня. */
  readonly movement: number;
}

export interface GameState {
  readonly version: number;
  readonly rng: RngState;
  readonly map: MapState;
  readonly players: readonly PlayerState[];
  readonly heroes: readonly HeroState[];
  /** Объекты карты; подобранная кучка из списка исчезает. */
  readonly objects: readonly ObjectState[];
  /** Номер дня партии, начиная с 1. */
  readonly day: number;
  /** Номер игрока, чей сейчас ход. */
  readonly currentPlayer: number;
}

export interface MoveHeroCommand {
  readonly type: "moveHero";
  readonly player: number;
  readonly heroId: string;
  readonly path: readonly Direction[];
}

export interface EndTurnCommand {
  readonly type: "endTurn";
  readonly player: number;
}

export type Command = MoveHeroCommand | EndTurnCommand;

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

export type GameEvent =
  | HeroSteppedEvent
  | TurnEndedEvent
  | DayStartedEvent
  | PilePickedEvent
  | MineCapturedEvent
  | IncomeReceivedEvent;

/** Коды отказа. Общие — в 00-state-and-commands.md, остальные — в документах команд. */
export const REJECT_CODES = [
  "NOT_YOUR_TURN",
  "UNKNOWN_PLAYER",
  "UNKNOWN_COMMAND",
  "UNKNOWN_HERO",
  "NOT_OWNER",
  "EMPTY_PATH",
  "STEP_BLOCKED",
  "NOT_ENOUGH_MOVEMENT",
] as const;
export type RejectCode = (typeof REJECT_CODES)[number];

interface CommandAccepted {
  readonly ok: true;
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export interface CommandRejected {
  readonly ok: false;
  readonly code: RejectCode;
  readonly message: string;
}

export type CommandResult = CommandAccepted | CommandRejected;

export function reject(code: RejectCode, message: string): CommandRejected {
  return { ok: false, code, message };
}
