/**
 * Типы боя: описание, состояние, команды, события.
 * Спецификации: docs/mechanics/10-battle-field.md … 13-battle-damage.md.
 */
import type { LifeEvent } from "./lifeEvents.ts";
import type { RngState } from "../rng.ts";
import type { SpellDefinition, SpellEffect, SpellSchool } from "../spells.ts";
import type { Cell } from "./hex.ts";
import type { Fortification, SiegeState, Tower, WallPart } from "./siege.ts";

/** Номер версии формата состояния боя. */
export const BATTLE_VERSION = 4;

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
  /** Цена найма одного существа, золото (31-recruitment.md). */
  readonly price: number;
  /** Основной недельный прирост в жилище. */
  readonly growth: number;
  /**
   * Уровень существа, от 1 до 10; нет — 1. Нужен «Клону» (71-spells-life.md).
   * До 10 — потому что у нейтралов есть драконы десятого уровня (`docs/content/creatures.md`).
   */
  readonly level?: number | undefined;
  /**
   * Нейтрал: не из замка. Живёт только в охранниках и на карте, нанимать его негде
   * (`docs/mechanics/14-creatures.md`, `docs/content/creatures.md`).
   */
  readonly neutral?: boolean | undefined;
}

/** Герой в бою: прибавки отрядам и магия (62-battle-spells.md). */
export interface BattleHero {
  readonly attack: number;
  readonly defense: number;
  readonly spellPower: number;
  readonly mana: number;
  /** «Волшебство»: на сколько процентов больше урон заклинаний. */
  readonly sorcery: number;
  /** Заклинания целиком: состояние боя не зависит от файлов. У героя без книги — пусто. */
  readonly spells: readonly SpellDefinition[];
}

/** Герой в описании боя: магию можно не называть. */
type BattleHeroDefinition = Pick<BattleHero, "attack" | "defense"> & {
  readonly [K in "spellPower" | "mana" | "sorcery" | "spells"]?: BattleHero[K] | undefined;
};

/** Действие заклинания на отряде. */
interface StackEffect {
  /** Идентификатор заклинания. */
  readonly spell: string;
  readonly name: string;
  readonly effect: SpellEffect;
  readonly value: number;
  /** Для защиты от школы магии. */
  readonly school: SpellSchool | null;
  /** Вредное: его снимает «Лечение». */
  readonly negative: boolean;
  /** Сколько начал раунда действие ещё переживёт. У действия до конца боя не убывает. */
  readonly rounds: number;
  /** Только у действия до конца боя: сколько раз наложено («Разрушающий луч»). */
  readonly stacks?: number | undefined;
  /** Только у «Контрудара»: сколько лишних ответных ударов уже нанесено в этом раунде. */
  readonly used?: number | undefined;
}

export interface ArmyDefinition {
  readonly hero?: BattleHeroDefinition | undefined;
  readonly morale: number;
  readonly luck: number;
  readonly army: readonly { readonly creature: string; readonly count: number }[];
}

/** Описание боя до его начала: то же, что в файле боя. */
export interface BattleDefinition {
  readonly id: string;
  readonly name: string;
  readonly obstacles: readonly Cell[];
  /** Осада (50-siege.md): старшее укрепление города и число его зданий без укреплений. */
  readonly siege?:
    | { readonly fortification: Fortification; readonly buildings: number }
    | undefined;
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
  /** Действия заклинаний на отряде. */
  readonly effects: readonly StackEffect[];
  /** Сколько существ поднято «Воскрешением» только до конца боя (71-spells-life.md). */
  readonly raised?: number | undefined;
  /** Отряд — клон: идентификатор отряда, с которого он снят. */
  readonly cloneOf?: string | undefined;
}

export interface BattleSideState {
  readonly hero: BattleHero | null;
  readonly morale: number;
  readonly luck: number;
  /** Герой уже колдовал в этом раунде. */
  readonly cast: boolean;
}

/** `bothDestroyed` — обе армии погибли разом: победителя нет, `winner` — обороняющийся. */
export type BattleEndReason = "destroyed" | "fled" | "bothDestroyed";

export interface BattleResult {
  readonly winner: BattleSide;
  readonly reason: BattleEndReason;
  /** Потери каждого отряда обеих сторон. */
  readonly losses: readonly { readonly stackId: string; readonly lost: number }[];
}

/** Постройка на поле, поставленная заклинанием (70-spells-field.md). */
export interface FieldObject {
  /**
   * `forceField` — силовое поле: на его клетки нельзя встать; `fireWall` — стена огня: жжёт вошедшего;
   * `quicksand` — пески: пеший увязает; `mine` — мина: бьёт врага и исчезает.
   */
  readonly kind: "forceField" | "fireWall" | "quicksand" | "mine";
  readonly cells: readonly Cell[];
  /** Чей герой её поставил. */
  readonly side: BattleSide;
  /** Сколько начал раунда постройка ещё переживёт; 0 — стоит до конца боя. */
  readonly rounds: number;
  /** Врагу не видна: пески, пока никто не увяз, и мины. */
  readonly hidden?: true | undefined;
  /** Урон стены огня и мины до защиты отряда. */
  readonly damage?: number | undefined;
  /** Круг заклинания: отряд под «Антимагией» этого круга постройку не замечает. */
  readonly level?: number | undefined;
}

export interface BattleState {
  readonly version: number;
  readonly rng: RngState;
  readonly round: number;
  readonly obstacles: readonly Cell[];
  /** Постройки заклинаний. */
  readonly fields: readonly FieldObject[];
  /** Стена, ворота, ров и башни; `null` — бой не осада. */
  readonly siege: SiegeState | null;
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
  | { readonly type: "battleFlee"; readonly side: BattleSide }
  | {
      readonly type: "battleCast";
      readonly side: BattleSide;
      /** Идентификатор заклинания. */
      readonly spell: string;
      /** Отряд-цель; у заклинания в клетку и у «Армагеддона» его нет. У «Телепорта» — и отряд, и клетка. */
      readonly target?: string | undefined;
      /** Клетка-цель заклинания по площади (68-spells-area.md). */
      readonly cell?: Cell | undefined;
      /** «Жертва»: отряд, который отдают (71-spells-life.md). */
      readonly victim?: string | undefined;
    };

/** Чем кончилось заклинание. */
export type SpellOutcome =
  | {
      readonly kind: "damage";
      readonly damage: number;
      readonly killed: number;
      readonly left: number;
    }
  | { readonly kind: "heal"; readonly healed: number; readonly removed: readonly string[] }
  | { readonly kind: "dispel"; readonly removed: readonly string[] }
  | {
      readonly kind: "effect";
      /** 0 — до конца боя. */
      readonly rounds: number;
      readonly removed: readonly string[];
    };

export type StrikeKind = "melee" | "retaliation" | "shot";

export type BattleEvent =
  | { readonly type: "roundStarted"; readonly round: number }
  | { readonly type: "stackTurn"; readonly stackId: string }
  | { readonly type: "stackFroze"; readonly stackId: string }
  | {
      /** Заклинание поставило постройку (70-spells-field.md). */
      readonly type: "fieldPlaced";
      readonly kind: FieldObject["kind"];
      readonly cells: readonly Cell[];
      readonly side: BattleSide;
    }
  | {
      /** Постройка исчезла: вышел срок или её убрали заклинанием. */
      readonly type: "fieldRemoved";
      readonly kind: FieldObject["kind"];
      readonly cells: readonly Cell[];
      readonly reason: "expired" | "removed" | "exploded";
    }
  | {
      /** Мина или стена огня обожгла отряд в клетке `cell`. */
      readonly type: "trapDamage";
      readonly kind: "mine" | "fireWall";
      readonly stackId: string;
      readonly cell: Cell;
      readonly damage: number;
      readonly killed: number;
      readonly left: number;
    }
  | LifeEvent
  /** Отряд увяз в зыбучих песках: ход кончен, пески теперь видны всем. */
  | { readonly type: "stackStuck"; readonly stackId: string; readonly cell: Cell }
  | {
      /** Герой наколдовал заклинание поля; что оно сделало — в следующих событиях. */
      readonly type: "fieldCast";
      readonly side: BattleSide;
      readonly spell: string;
      readonly name: string;
      readonly manaLeft: number;
    }
  | { readonly type: "obstacleRemoved"; readonly cell: Cell }
  /** «Землетрясение» ударило по части укреплений; `left` — прочность после удара. */
  | { readonly type: "wallShaken"; readonly part: WallPart; readonly left: number }
  | {
      readonly type: "stackTeleported";
      readonly stackId: string;
      readonly from: Cell;
      readonly to: Cell;
    }
  /** Отряд в берсерке действует сам: дальше идут его шаг, удар или выстрел. */
  | { readonly type: "berserkTurn"; readonly stackId: string; readonly targetId: string | null }
  | {
      /** «Волшебное зеркало» отряда `stackId` отразило заклинание на отряд `toId`. */
      readonly type: "spellReflected";
      readonly stackId: string;
      readonly toId: string;
      readonly spell: string;
      readonly name: string;
    }
  /** Ослеплённый отряд пропустил ход (69-spells-control.md). */
  | { readonly type: "stackBlind"; readonly stackId: string }
  | {
      /** «Огненный щит» отряда `stackId` обжёг ударившего. */
      readonly type: "fireShield";
      readonly stackId: string;
      readonly targetId: string;
      readonly damage: number;
      readonly killed: number;
      readonly left: number;
    }
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
  | {
      readonly type: "towerShot";
      readonly tower: Tower;
      readonly targetId: string;
      readonly damage: number;
      readonly killed: number;
      readonly left: number;
    }
  | {
      readonly type: "catapultShot";
      /** Куда целилась и куда попала; `left` — прочность после выстрела. */
      readonly aimed: WallPart;
      readonly hit: WallPart;
      readonly damage: number;
      readonly left: number;
    }
  | {
      readonly type: "moatDamage";
      readonly stackId: string;
      readonly damage: number;
      readonly killed: number;
      readonly left: number;
    }
  | {
      readonly type: "spellCast";
      readonly side: BattleSide;
      readonly spell: string;
      readonly name: string;
      readonly targetId: string;
      readonly manaLeft: number;
      readonly outcome: SpellOutcome;
    }
  | {
      /** Заклинание по площади никого не задело. */
      readonly type: "spellMissed";
      readonly side: BattleSide;
      readonly spell: string;
      readonly name: string;
      readonly manaLeft: number;
    }
  | {
      readonly type: "effectEnded";
      readonly stackId: string;
      readonly spell: string;
      readonly name: string;
    }
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
  "UNKNOWN_SPELL",
  "NOT_ENOUGH_MANA",
  "ALREADY_CAST",
  "BAD_SPELL_TARGET",
  "BAD_SPELL_CELL",
  "NOT_A_SIEGE",
] as const;

export type BattleRejectCode = (typeof BATTLE_REJECT_CODES)[number];

export type BattleCommandResult =
  | { readonly ok: true; readonly state: BattleState; readonly events: readonly BattleEvent[] }
  | { readonly ok: false; readonly code: BattleRejectCode; readonly message: string };
