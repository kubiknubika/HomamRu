/**
 * Герои с именами и таверна: типы. Спецификация: docs/mechanics/32-hero-hire.md.
 */
import type { CreatureDefinition } from "./battle/types.ts";
import type { ArmyStack } from "./types.ts";
import type { BuildingDefinition } from "./types.ts";

/** Герой из файла героев: имя и начальные атака и защита. */
export interface HeroKind {
  readonly id: string;
  readonly name: string;
  readonly attack: number;
  readonly defense: number;
}

/** Отряд в армии героя таверны: он есть, если бросок 1–100 не больше `chance`. */
export interface TavernStackRule {
  readonly creature: string;
  readonly min: number;
  readonly max: number;
  readonly chance: number;
}

/** Правила таверны: цена героя и его случайная армия. */
export interface TavernRules {
  /** Цена найма героя, золото. */
  readonly price: number;
  readonly army: readonly TavernStackRule[];
}

/** Герой, который ждёт в таверне: кто он и с какой армией придёт. */
export interface TavernOffer {
  /** Идентификатор героя из файла героев. */
  readonly kind: string;
  readonly army: readonly ArmyStack[];
}

/** Контент игры, из которого создаётся партия; хранится в состоянии целиком. */
export interface GameContent {
  readonly creatures: readonly CreatureDefinition[];
  readonly buildings: readonly BuildingDefinition[];
  readonly heroes: readonly HeroKind[];
  readonly tavern: TavernRules;
}

export interface HireHeroCommand {
  readonly type: "hireHero";
  readonly player: number;
  readonly townId: string;
  /** Какого из двух героев таверны нанять: 0 или 1. */
  readonly offer: number;
}
