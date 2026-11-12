/**
 * Проверка городов карты по смыслу. Спецификация: docs/mechanics/30-town.md, «Файл карты».
 */
import type { CreatureDefinition } from "./battle/types.ts";
import type { BuildingDefinition, MapDefinition } from "./types.ts";

interface ContentError {
  readonly field: string;
  readonly message: string;
}

type TownDefinition = Extract<NonNullable<MapDefinition["objects"]>[number], { type: "town" }>;

function buildingErrors(
  field: string,
  town: TownDefinition,
  buildings: readonly BuildingDefinition[],
): ContentError[] {
  const errors: ContentError[] = [];
  const built = town.buildings ?? [];
  built.forEach((id, index) => {
    const building = buildings.find((candidate) => candidate.id === id);
    if (building === undefined) {
      errors.push({ field: `${field}.buildings.${index}`, message: `Здания «${id}» нет.` });
      return;
    }
    if (built.indexOf(id) !== index) {
      errors.push({
        field: `${field}.buildings.${index}`,
        message: `Здание «${id}» записано дважды.`,
      });
    }
    for (const required of building.requires) {
      if (!built.includes(required)) {
        errors.push({
          field: `${field}.buildings.${index}`,
          message: `Зданию «${id}» нужно «${required}», а его в городе нет.`,
        });
      }
    }
  });
  // Таверна есть в каждом городе: без неё игрок, потерявший героя, остался бы без выхода.
  const tavern = buildings.find((building) => building.tavern === true);
  if (tavern !== undefined && !built.includes(tavern.id)) {
    errors.push({ field: `${field}.buildings`, message: `В городе нет здания «${tavern.id}».` });
  }
  return errors;
}

function garrisonErrors(
  field: string,
  town: TownDefinition,
  known: ReadonlySet<string>,
): ContentError[] {
  const errors: ContentError[] = [];
  const garrison = town.garrison ?? [];
  garrison.forEach((stack, index) => {
    const at = `${field}.garrison.${index}`;
    if (!known.has(stack.creature)) {
      errors.push({ field: at, message: `Существа «${stack.creature}» нет.` });
    }
    if (!Number.isInteger(stack.count) || stack.count < 1) {
      errors.push({
        field: at,
        message: `Существ ${stack.count}; должно быть целое, не меньше 1.`,
      });
    }
    if (garrison.findIndex((other) => other.creature === stack.creature) !== index) {
      errors.push({ field: at, message: `Существо «${stack.creature}» записано дважды.` });
    }
  });
  return errors;
}

/** Ошибки в городах карты. Пустой список — всё верно. */
export function townErrors(
  map: MapDefinition,
  creatures: readonly CreatureDefinition[],
  buildings: readonly BuildingDefinition[],
): ContentError[] {
  const known = new Set(creatures.map((creature) => creature.id));
  const errors: ContentError[] = [];
  const owners = new Set<number>();
  (map.objects ?? []).forEach((object, index) => {
    if (object.type !== "town") {
      return;
    }
    const field = `objects.${index}`;
    const { owner } = object;
    if (!Number.isInteger(owner) || owner < 0 || owner >= map.players.length) {
      errors.push({ field: `${field}.owner`, message: `Игрока с номером ${owner} на карте нет.` });
    } else if (owners.has(owner)) {
      errors.push({ field: `${field}.owner`, message: `У игрока ${owner + 1} уже есть город.` });
    }
    owners.add(owner);
    errors.push(
      ...buildingErrors(field, object, buildings),
      ...garrisonErrors(field, object, known),
    );
  });
  return errors;
}
