/**
 * Заклинания карты для тестов (73-map-spells.md) — те же, что в data/spells.yaml.
 */
import type { SpellDefinition, SpellEffect, SpellSchool } from "./spells.ts";

function mapSpell(
  [id, name, level]: readonly [string, string, number],
  schools: readonly SpellSchool[],
  [cost, skilledCost, value, chance]: readonly [number, number, number, number],
  effect: SpellEffect,
  values: readonly [number, number, number],
): SpellDefinition {
  return {
    id,
    name,
    level,
    schools,
    cost,
    skilledCost,
    power: 0,
    value,
    chance,
    effect,
    target: "ally",
    values,
    expertMass: false,
    advancedAnyTarget: false,
    counters: [],
  };
}

export const MAP_SPELLS: readonly SpellDefinition[] = [
  mapSpell(
    ["visions", "Видения", 2],
    ["earth", "water", "fire", "air"],
    [4, 2, 1, 2],
    "visions",
    [1, 2, 3],
  ),
  mapSpell(["disguise", "Маскировка", 2], ["air"], [4, 2, 0, 2], "disguise", [0, 0, 0]),
  mapSpell(
    ["town-portal", "Городской портал", 4],
    ["earth"],
    [16, 12, 300, 10],
    "townPortal",
    [300, 300, 200],
  ),
];
