/**
 * Типы игрового состояния, команд и событий.
 * Спецификация: docs/mechanics/00-state-and-commands.md.
 */
import type {
  HeroKind,
  HireHeroCommand,
  OpponentRules,
  TavernOffer,
  TavernRules,
} from "./tavernTypes.ts";
import type {
  BattleCommand,
  BattleRejectCode,
  BattleState,
  CreatureDefinition,
} from "./battle/types.ts";
import type { GameEvent } from "./events.ts";
import type { RngState } from "./rng.ts";

/** Номер версии формата состояния. Увеличивается при любом изменении формата. */
export const STATE_VERSION = 7;

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
  | { readonly type: "mine"; readonly x: number; readonly y: number; readonly kind: MineKind }
  | {
      readonly type: "guard";
      readonly x: number;
      readonly y: number;
      readonly creature: string;
      readonly count: number;
    }
  | {
      readonly type: "town";
      readonly x: number;
      readonly y: number;
      /** Номер игрока-владельца. */
      readonly owner: number;
      /** Что построено в начале. */
      readonly buildings?: readonly string[] | undefined;
      /** Гарнизон в начале. */
      readonly garrison?: readonly ArmyStack[] | undefined;
    };

/** Здание города: то же, что в файле зданий (30-town.md). */
export interface BuildingDefinition {
  readonly id: string;
  readonly name: string;
  readonly cost: ResourceAmounts;
  /** Здания, без которых это не построить. */
  readonly requires: readonly string[];
  /** Доход города в день с этим зданием, золото. */
  readonly income?: number | undefined;
  /** Прибавка к приросту во всех жилищах, в процентах от основного. */
  readonly growthPercent?: number | undefined;
  /** Таверна: здесь нанимают героя; есть в каждом городе с начала (32-hero-hire.md). */
  readonly tavern?: boolean | undefined;
  /** Жилище: идентификатор существа, которое здесь нанимают (31-recruitment.md). */
  readonly dwelling?: string | undefined;
}

/** Отряд армии: вид существ и их число. */
export interface ArmyStack {
  readonly creature: string;
  readonly count: number;
}

/** Герой в файле карты: клетка, характеристики, армия (22-hero.md). */
interface HeroDefinition extends Position {
  /** Идентификатор героя из файла героев; по умолчанию — первый из списка (32-hero-hire.md). */
  readonly name?: string | undefined;
  /** По умолчанию — как у героя из списка. */
  readonly attack?: number | undefined;
  /** По умолчанию — как у героя из списка. */
  readonly defense?: number | undefined;
  readonly army: readonly ArmyStack[];
}

/** Описание карты до начала партии: то же, что в файле карты. */
export interface MapDefinition {
  readonly id: string;
  readonly name: string;
  /** Строки карты сверху вниз; каждый символ — одна клетка. */
  readonly terrain: readonly string[];
  /** Игроки по порядку хода. */
  readonly players: readonly {
    readonly hero: HeroDefinition;
    /** Кто отдаёт команды: человек (по умолчанию) или компьютер (40-two-players.md). */
    readonly kind?: PlayerKind | undefined;
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
  /**
   * Стартовые клетки игроков по порядку — из файла карты. В игре не меняются.
   * Нужны при чтении сохранения: герой без клетки ставится сюда (04-save.md).
   */
  readonly starts: readonly Position[];
}

type PlayerKind = "human" | "computer";

export interface PlayerState {
  /** Номер игрока с нуля; совпадает с местом в списке игроков. */
  readonly id: number;
  readonly kind: PlayerKind;
  /** Игрок выбыл: в очереди ходов его пропускают (41-victory.md). */
  readonly eliminated: boolean;
  /**
   * Сколько своих ходов игрок закончил без города; `null` — города он не терял.
   * У выбывшего: 7 — вышел срок без города, `null` — не осталось ни героя, ни города.
   */
  readonly townlessDays: number | null;
  readonly resources: Resources;
  /** Герои, которые ждут в таверне игрока; у игрока без города — пусто (32-hero-hire.md). */
  readonly tavern: readonly TavernOffer[];
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

/** Охранник: нейтральный отряд (21-guards.md). */
export interface GuardState {
  readonly id: string;
  readonly type: "guard";
  readonly x: number;
  readonly y: number;
  readonly creature: string;
  readonly count: number;
  /** Число существ в тысячных долях: в нём копится дробь недельного роста. */
  readonly power: number;
}

/** Город (30-town.md). */
export interface TownState {
  readonly id: string;
  readonly type: "town";
  readonly x: number;
  readonly y: number;
  readonly owner: number;
  /** Построенные здания по порядку постройки. */
  readonly buildings: readonly string[];
  /** Сегодня в городе уже строили. */
  readonly builtToday: boolean;
  /** Сколько существ каждого вида ждёт найма. */
  readonly available: readonly ArmyStack[];
  readonly garrison: readonly ArmyStack[];
}

export type ObjectState = PileState | MineState | GuardState | TownState;

export interface HeroState {
  readonly id: string;
  /** Номер игрока-владельца. */
  readonly owner: number;
  /** Идентификатор героя из файла героев. */
  readonly kind: string;
  /** Имя героя. */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Остаток запаса хода на сегодня. */
  readonly movement: number;
  readonly attack: number;
  readonly defense: number;
  /** От 1 до 7 отрядов; порядок задаёт места на поле боя. */
  readonly army: readonly ArmyStack[];
  readonly experience: number;
  readonly level: number;
}

/**
 * Идущий бой (23-map-battle.md, 40-two-players.md). Нападает всегда герой; обороняется
 * охранник, чужой герой или чужой город (гарнизон либо герой вместе с гарнизоном).
 */
export interface MapBattle {
  /** Нападающий герой. */
  readonly heroId: string;
  /** Охранник-обороняющийся; `null` — бой не с охранником. */
  readonly guardId: string | null;
  /** Герой-обороняющийся; `null` — у обороняющегося героя нет. */
  readonly defenderHeroId: string | null;
  /** Город, за который идёт бой; `null` — бой не за город. */
  readonly townId: string | null;
  readonly state: BattleState;
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
  /** Существа игры целиком: состояние не зависит от файлов. */
  readonly creatures: readonly CreatureDefinition[];
  /** Здания игры целиком: состояние не зависит от файлов. */
  readonly buildings: readonly BuildingDefinition[];
  /** Герои игры: из них выбираются герои таверны. */
  readonly heroKinds: readonly HeroKind[];
  /** Правила таверны: цена героя и его случайная армия. */
  readonly tavern: TavernRules;
  /** Настройки компьютерного игрока: перевес для нападения и порядок стройки. */
  readonly opponent: OpponentRules;
  /** Идущий бой; `null` — боя нет. */
  readonly battle: MapBattle | null;
  /**
   * Итог партии; `null` — партия идёт. «Поражение» — единственный игрок выбыл;
   * «победа» — на карте для двоих остался один, он записан в `winner` (41-victory.md).
   */
  readonly outcome: "defeat" | "victory" | null;
  /** Победитель; `null` — партия идёт или победителя нет. */
  readonly winner: number | null;
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

interface BuildCommand {
  readonly type: "build";
  readonly player: number;
  readonly townId: string;
  readonly building: string;
}

interface RecruitCommand {
  readonly type: "recruit";
  readonly player: number;
  readonly townId: string;
  readonly creature: string;
  readonly count: number;
}

interface TransferCommand {
  readonly type: "transfer";
  readonly player: number;
  readonly townId: string;
  /** Кто отдаёт: гарнизон герою или герой гарнизону. */
  readonly from: "garrison" | "hero";
  readonly creature: string;
  readonly count: number;
}

export type TownCommand = BuildCommand | RecruitCommand | TransferCommand;

/** Команды карты, города и боя: бой — часть партии. */
export type Command =
  | MoveHeroCommand
  | EndTurnCommand
  | TownCommand
  | HireHeroCommand
  | BattleCommand;

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
  "BATTLE_IN_PROGRESS",
  "NO_BATTLE",
  "GAME_OVER",
  "NO_TOWN",
  "UNKNOWN_BUILDING",
  "ALREADY_BUILT",
  "BUILT_TODAY",
  "REQUIREMENT_MISSING",
  "NOT_ENOUGH_RESOURCES",
  "NO_DWELLING",
  "BAD_COUNT",
  "NOT_AVAILABLE",
  "HERO_NOT_IN_TOWN",
  "LAST_STACK",
  "NO_TAVERN",
  "HERO_EXISTS",
  "BAD_OFFER",
  "CANNOT_FLEE",
] as const;
/** Отказ команды партии: свой код или код отказа команды боя (12-battle-actions.md). */
export type RejectCode = (typeof REJECT_CODES)[number] | BattleRejectCode;

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

export type { GameEvent } from "./events.ts";
