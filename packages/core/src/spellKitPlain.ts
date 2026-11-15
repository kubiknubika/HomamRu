/** Заклинания кругов 2–5 для тестов: те же, что в data/spells.yaml (67-spells-plain.md). */
import type { SpellDefinition, SpellEffect, SpellSchool } from "./spells.ts";

type Extra = Partial<
  Pick<
    SpellDefinition,
    "expertMass" | "protects" | "cumulative" | "spareMachines" | "area" | "chain" | "counters"
  >
>;

/** Порядок полей — как в файле заклинаний: тест сравнивает наборы целиком. */
function plain(
  [id, name, level, school]: readonly [string, string, number, SpellSchool],
  [cost, skilledCost, power, value]: readonly [number, number, number, number],
  effect: SpellEffect,
  target: "enemy" | "ally",
  values: readonly [number, number, number],
  extra: Extra = {},
): SpellDefinition {
  return {
    id,
    name,
    level,
    schools: [school],
    cost,
    skilledCost,
    power,
    value,
    chance: 0,
    effect,
    target,
    values,
    expertMass: extra.expertMass ?? false,
    advancedAnyTarget: false,
    ...(extra.protects === undefined ? {} : { protects: extra.protects }),
    ...(extra.cumulative === undefined ? {} : { cumulative: extra.cumulative }),
    ...(extra.spareMachines === undefined ? {} : { spareMachines: extra.spareMachines }),
    ...(extra.area === undefined ? {} : { area: extra.area }),
    ...(extra.chain === undefined ? {} : { chain: extra.chain }),
    counters: extra.counters ?? [],
  };
}

export const PLAIN_SPELLS: readonly SpellDefinition[] = [
  plain(
    ["ice-bolt", "Ледяная молния", 2, "water"],
    [8, 6, 20, 10],
    "damage",
    "enemy",
    [10, 20, 50],
  ),
  plain(["lightning-bolt", "Молния", 2, "air"], [10, 8, 25, 10], "damage", "enemy", [10, 20, 50]),
  plain(
    ["protection-from-air", "Защита от воздуха", 2, "air"],
    [7, 5, 0, 70],
    "spellDamagePercent",
    "ally",
    [70, 50, 50],
    { expertMass: true, protects: "air" },
  ),
  plain(["precision", "Точность", 2, "air"], [8, 6, 0, 3], "shotAttack", "ally", [3, 6, 6], {
    expertMass: true,
  }),
  plain(["weakness", "Слабость", 2, "water"], [8, 6, 0, 3], "attackDown", "enemy", [3, 6, 6], {
    expertMass: true,
    counters: ["bloodlust"],
  }),
  plain(
    ["disrupting-ray", "Разрушающий луч", 2, "air"],
    [10, 8, 0, 3],
    "defenseDown",
    "enemy",
    [3, 4, 5],
    { cumulative: true },
  ),
  plain(["fortune", "Удача", 2, "air"], [7, 5, 0, 1], "luck", "ally", [1, 2, 2], {
    expertMass: true,
    counters: ["misfortune"],
  }),
  plain(
    ["air-shield", "Воздушный щит", 3, "air"],
    [12, 9, 0, 75],
    "shotDamagePercent",
    "ally",
    [75, 50, 50],
    { expertMass: true },
  ),
  plain(
    ["protection-from-earth", "Защита от земли", 3, "earth"],
    [12, 9, 0, 70],
    "spellDamagePercent",
    "ally",
    [70, 50, 50],
    { expertMass: true, protects: "earth" },
  ),
  plain(["mirth", "Радость", 3, "water"], [12, 9, 0, 1], "morale", "ally", [1, 2, 2], {
    expertMass: true,
    counters: ["sorrow"],
  }),
  plain(["misfortune", "Неудача", 3, "fire"], [12, 9, 0, 1], "luckDown", "enemy", [1, 2, 2], {
    expertMass: true,
    counters: ["fortune"],
  }),
  plain(["prayer", "Молитва", 4, "water"], [16, 12, 0, 2], "prayer", "ally", [2, 4, 4], {
    expertMass: true,
  }),
  plain(["sorrow", "Печаль", 4, "earth"], [16, 12, 0, 1], "moraleDown", "enemy", [1, 2, 2], {
    expertMass: true,
    counters: ["mirth"],
  }),
  plain(["implosion", "Взрыв", 5, "earth"], [30, 25, 75, 100], "damage", "enemy", [100, 200, 300], {
    spareMachines: true,
  }),
  // Урон по площади (68-spells-area.md).
  plain(
    ["frost-ring", "Кольцо холода", 3, "water"],
    [12, 9, 10, 15],
    "damage",
    "enemy",
    [15, 30, 60],
    { area: "ring" },
  ),
  plain(
    ["fireball", "Огненный шар", 3, "fire"],
    [15, 12, 10, 15],
    "damage",
    "enemy",
    [15, 30, 60],
    { area: "ball" },
  ),
  plain(["inferno", "Инферно", 4, "fire"], [16, 12, 10, 20], "damage", "enemy", [20, 40, 80], {
    area: "inferno",
  }),
  plain(
    ["meteor-shower", "Метеоритный дождь", 4, "earth"],
    [16, 12, 25, 25],
    "damage",
    "enemy",
    [25, 50, 100],
    { area: "ball" },
  ),
  plain(
    ["chain-lightning", "Цепная молния", 4, "air"],
    [24, 20, 40, 25],
    "damage",
    "enemy",
    [25, 50, 100],
    { area: "chain", chain: [4, 4, 5, 5] },
  ),
  plain(
    ["armageddon", "Армагеддон", 4, "fire"],
    [24, 20, 50, 30],
    "damage",
    "enemy",
    [30, 60, 120],
    { area: "all" },
  ),
];
