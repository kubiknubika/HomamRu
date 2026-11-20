/**
 * Чтение города и зданий из сохранения — терпимо, как и всё состояние.
 * Правила: docs/mechanics/04-save.md, «Сохранения других версий».
 */
import type {
  ArmyStack,
  BuildingDefinition,
  CreatureDefinition,
  SpellDefinition,
  TownState,
} from "@homamru/core";
import { z } from "zod";
import { buildingSchema, savedCreatureSchema } from "./battle.ts";
import type { SaveDefaults } from "./defaults.ts";
import { defaultGuild, readSpellIds } from "./spells.ts";

const stackSchema = z.object({ creature: z.string(), count: z.int().min(1) });

interface LooseTown extends Omit<TownState, "available" | "garrison" | "spells"> {
  readonly available: readonly unknown[];
  readonly garrison: readonly unknown[];
  readonly spells?: unknown;
}

function readable<S extends z.ZodType>(items: readonly unknown[], schema: S): z.infer<S>[] {
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Существа партии: читаемые из записи, а за ними существа игры, которых в записи нет.
 * Цена и прирост, которых в записи нет, берутся у существа игры; нет и его — существо убирается.
 */
export function readCreatures(
  items: readonly unknown[],
  defaults: SaveDefaults,
): CreatureDefinition[] {
  const saved = readable(items, savedCreatureSchema).flatMap((creature) => {
    const ours = defaults.creatures.find((candidate) => candidate.id === creature.id);
    const price = creature.price > 0 ? creature.price : ours?.price;
    const growth = creature.growth > 0 ? creature.growth : ours?.growth;
    return price === undefined || growth === undefined ? [] : [canonical(creature, price, growth)];
  });
  const known = new Set(saved.map((creature) => creature.id));
  return [...saved, ...defaults.creatures.filter((creature) => !known.has(creature.id))];
}

/**
 * Существо в том же порядке полей, что и умолчания: иначе повторное чтение даёт
 * другой порядок ключей, и запись перестаёт быть устойчивой (`saveFuzz.test.ts`).
 */
function canonical(
  creature: z.infer<typeof savedCreatureSchema>,
  price: number,
  growth: number,
): CreatureDefinition {
  const { id, name, attack, defense, damageMin, damageMax, health, speed, flying, shots, level } =
    creature;
  const base: CreatureDefinition = {
    id,
    name,
    attack,
    defense,
    damageMin,
    damageMax,
    health,
    speed,
    flying,
    shots,
    price,
    growth,
  };
  return level === undefined ? base : { ...base, level };
}

/**
 * Здания партии: читаемые из записи, а за ними здания игры, которых в записи нет.
 * Из требований убираются здания, которых в списке нет.
 */
export function readBuildings(
  items: readonly unknown[],
  defaults: SaveDefaults,
): BuildingDefinition[] {
  const saved = readable(items, buildingSchema.strip());
  const known = new Set(saved.map((building) => building.id));
  const all = [...saved, ...defaults.buildings.filter((building) => !known.has(building.id))];
  const ids = new Set(all.map((building) => building.id));
  return all.map((building) => ({
    ...building,
    requires: building.requires.filter((id) => ids.has(id)),
  }));
}

/** Армия: отряды знакомых существ с числом от 1; одинаковые сливаются. */
function readStacks(items: readonly unknown[], allowed: ReadonlySet<string>): ArmyStack[] {
  const army: ArmyStack[] = [];
  for (const stack of readable(items, stackSchema)) {
    const at = army.findIndex((other) => other.creature === stack.creature);
    if (!allowed.has(stack.creature)) {
      continue;
    }
    if (at === -1) {
      army.push(stack);
    } else {
      army[at] = { creature: stack.creature, count: stack.count + (army[at]?.count ?? 0) };
    }
  }
  return army;
}

/**
 * Город: незнакомые и повторные здания убираются; ждать найма могут только существа
 * построенных жилищ; в гарнизоне — только знакомые существа.
 */
export function readTown(
  town: LooseTown,
  buildings: readonly BuildingDefinition[],
  known: ReadonlySet<string>,
  spells: readonly SpellDefinition[],
): TownState {
  const built = [...new Set(town.buildings)].filter((id) =>
    buildings.some((building) => building.id === id),
  );
  const dwellers = new Set(
    buildings
      .filter((building) => built.includes(building.id))
      .flatMap((building) => (building.dwelling === undefined ? [] : [building.dwelling]))
      .filter((creature) => known.has(creature)),
  );
  return {
    ...town,
    buildings: built,
    available: readStacks(town.available, dwellers),
    garrison: readStacks(town.garrison, known),
    spells: defaultGuild(spells, readSpellIds(town.spells, spells) ?? []),
  };
}
