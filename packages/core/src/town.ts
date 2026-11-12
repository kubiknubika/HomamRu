/**
 * Город: здания, строительство, доход, прирост, наём, гарнизон.
 * Спецификации: docs/mechanics/30-town.md, 31-recruitment.md.
 */
import { addToArmy, countIn, removeFromArmy } from "./army.ts";
import type { CreatureDefinition } from "./battle/types.ts";
import { RESOURCES, reject } from "./types.ts";
import type {
  ArmyStack,
  BuildingDefinition,
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  ResourceAmounts,
  Resources,
  TownCommand,
  TownState,
} from "./types.ts";

/** Доход города без ратуши, золото в день. Число — из Heroes 3. */
export const TOWN_BASE_INCOME = 500;

/** Город игрока, если он есть. */
export function townOf(state: GameState, player: number): TownState | undefined {
  return state.objects.find(
    (object): object is TownState => object.type === "town" && object.owner === player,
  );
}

function built(state: GameState, town: TownState): BuildingDefinition[] {
  return state.buildings.filter((building) => town.buildings.includes(building.id));
}

/** Доход города в день: наибольший среди построенных зданий, но не меньше основного. */
export function townIncome(state: GameState, town: TownState): number {
  return Math.max(TOWN_BASE_INCOME, ...built(state, town).map((building) => building.income ?? 0));
}

/** Недельный прирост жилища в этом городе: основной плюс прибавка цитадели или замка. */
export function weeklyGrowth(state: GameState, town: TownState, base: number): number {
  const percent = Math.max(0, ...built(state, town).map((building) => building.growthPercent ?? 0));
  return base + Math.floor((base * percent) / 100);
}

/** Чего не хватает, чтобы заплатить; пусто — хватает. */
export function missingResources(resources: Resources, cost: ResourceAmounts): ResourceAmounts {
  const missing: { -readonly [K in keyof ResourceAmounts]: number } = {};
  for (const resource of RESOURCES) {
    const lack = (cost[resource] ?? 0) - resources[resource];
    if (lack > 0) {
      missing[resource] = lack;
    }
  }
  return missing;
}

function pay(state: GameState, player: number, cost: ResourceAmounts): GameState {
  return {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === player
        ? {
            ...candidate,
            resources: {
              gold: candidate.resources.gold - (cost.gold ?? 0),
              wood: candidate.resources.wood - (cost.wood ?? 0),
              ore: candidate.resources.ore - (cost.ore ?? 0),
            },
          }
        : candidate,
    ),
  };
}

function withTown(state: GameState, town: TownState): GameState {
  return {
    ...state,
    objects: state.objects.map((object) => (object.id === town.id ? town : object)),
  };
}

/** Что мешает построить здание; `null` — можно. Порядок проверок — из 30-town.md. */
export function buildObstacle(
  state: GameState,
  town: TownState,
  buildingId: string,
): CommandResult | null {
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (building === undefined) {
    return reject("UNKNOWN_BUILDING", `Здания «${buildingId}» нет.`);
  }
  if (town.buildings.includes(buildingId)) {
    return reject("ALREADY_BUILT", `«${building.name}» уже построено.`);
  }
  if (town.builtToday) {
    return reject("BUILT_TODAY", "Сегодня в этом городе уже строили.");
  }
  const absent = building.requires.filter((id) => !town.buildings.includes(id));
  if (absent.length > 0) {
    const names = absent.map((id) => state.buildings.find((b) => b.id === id)?.name ?? id);
    return reject("REQUIREMENT_MISSING", `Сначала нужно построить: ${names.join(", ")}.`);
  }
  const resources = state.players[town.owner]?.resources;
  if (
    resources === undefined ||
    Object.keys(missingResources(resources, building.cost)).length > 0
  ) {
    return reject("NOT_ENOUGH_RESOURCES", `На «${building.name}» не хватает ресурсов.`);
  }
  return null;
}

/** Существа построенных жилищ города, по порядку постройки. */
export function dwellers(state: GameState, town: TownState): CreatureDefinition[] {
  const result: CreatureDefinition[] = [];
  for (const id of town.buildings) {
    const dwelling = state.buildings.find((building) => building.id === id)?.dwelling;
    const creature = state.creatures.find((candidate) => candidate.id === dwelling);
    if (creature !== undefined) {
      result.push(creature);
    }
  }
  return result;
}

/** Существа, которые сразу ждут найма в только что построенном жилище. */
function withDwellingStock(state: GameState, town: TownState, buildingId: string): TownState {
  const dwelling = state.buildings.find((building) => building.id === buildingId)?.dwelling;
  const creature = state.creatures.find((candidate) => candidate.id === dwelling);
  if (creature === undefined) {
    return town;
  }
  const added = weeklyGrowth(state, town, creature.growth);
  return { ...town, available: addToArmy(town.available, creature.id, added) };
}

/** Город в начале партии: в построенных жилищах уже ждёт недельный прирост. */
export function stockTown(state: GameState, town: TownState): TownState {
  return town.buildings.reduce((stocked, id) => withDwellingStock(state, stocked, id), town);
}

function build(state: GameState, town: TownState, buildingId: string): CommandResult {
  const obstacle = buildObstacle(state, town, buildingId);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  if (obstacle !== null || building === undefined) {
    return obstacle ?? reject("UNKNOWN_BUILDING", `Здания «${buildingId}» нет.`);
  }
  const grown: TownState = {
    ...town,
    buildings: [...town.buildings, buildingId],
    builtToday: true,
  };
  const paid = pay(state, town.owner, building.cost);
  return {
    ok: true,
    state: withTown(paid, withDwellingStock(paid, grown, buildingId)),
    events: [
      { type: "buildingBuilt", townId: town.id, building: buildingId, spent: building.cost },
    ],
  };
}

function isCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1;
}

function recruit(
  state: GameState,
  town: TownState,
  creature: string,
  count: number,
): CommandResult {
  const dweller = dwellers(state, town).find((candidate) => candidate.id === creature);
  if (dweller === undefined) {
    return reject("NO_DWELLING", `Жилища существа «${creature}» в городе нет.`);
  }
  if (!isCount(count)) {
    return reject("BAD_COUNT", `Число ${count} не годится: нужно целое, не меньше 1.`);
  }
  const waiting = countIn(town.available, creature);
  if (count > waiting) {
    return reject("NOT_AVAILABLE", `Найма ждёт ${waiting}, а не ${count}.`);
  }
  const cost = count * dweller.price;
  if ((state.players[town.owner]?.resources.gold ?? 0) < cost) {
    return reject("NOT_ENOUGH_RESOURCES", `Нужно золота: ${cost}.`);
  }
  const next: TownState = {
    ...town,
    available: removeFromArmy(town.available, creature, count),
    garrison: addToArmy(town.garrison, creature, count),
  };
  return {
    ok: true,
    state: withTown(pay(state, town.owner, { gold: cost }), next),
    events: [{ type: "creaturesRecruited", townId: town.id, creature, count, cost }],
  };
}

function transfer(
  state: GameState,
  town: TownState,
  command: Extract<TownCommand, { type: "transfer" }>,
): CommandResult {
  const hero = state.heroes.find(
    (candidate) =>
      candidate.owner === town.owner && candidate.x === town.x && candidate.y === town.y,
  );
  if (hero === undefined) {
    return reject("HERO_NOT_IN_TOWN", "Героя в городе нет.");
  }
  const { from, creature, count } = command;
  if (!isCount(count)) {
    return reject("BAD_COUNT", `Число ${count} не годится: нужно целое, не меньше 1.`);
  }
  const giver: readonly ArmyStack[] = from === "hero" ? hero.army : town.garrison;
  const has = countIn(giver, creature);
  if (count > has) {
    return reject("NOT_AVAILABLE", `У отдающего ${has}, а не ${count}.`);
  }
  if (from === "hero" && hero.army.length === 1 && count === has) {
    return reject("LAST_STACK", "Герой не может остаться без армии.");
  }
  const left = removeFromArmy(giver, creature, count);
  const taker = addToArmy(from === "hero" ? town.garrison : hero.army, creature, count);
  const nextHero: HeroState = { ...hero, army: from === "hero" ? left : taker };
  const nextTown: TownState = { ...town, garrison: from === "hero" ? taker : left };
  const moved = withTown(state, nextTown);
  return {
    ok: true,
    state: { ...moved, heroes: moved.heroes.map((h) => (h.id === hero.id ? nextHero : h)) },
    events: [
      { type: "creaturesTransferred", townId: town.id, heroId: hero.id, from, creature, count },
    ],
  };
}

/** Команда города. Общие проверки (игрок, очередь хода, бой) уже сделаны. */
export function applyTownCommand(state: GameState, command: TownCommand): CommandResult {
  const town = state.objects.find(
    (object): object is TownState =>
      object.type === "town" && object.id === command.townId && object.owner === command.player,
  );
  if (town === undefined) {
    return reject("NO_TOWN", `Города ${command.townId} у игрока ${command.player + 1} нет.`);
  }
  switch (command.type) {
    case "build":
      return build(state, town, command.building);
    case "recruit":
      return recruit(state, town, command.creature, command.count);
    default:
      return transfer(state, town, command);
  }
}

/** Начало дня: в городах снова можно строить; в начале недели жилища дают прирост. */
export function startTownDay(state: GameState, newWeek: boolean, events: GameEvent[]): GameState {
  return {
    ...state,
    objects: state.objects.map((object) => {
      if (object.type !== "town") {
        return object;
      }
      let { available } = object;
      for (const creature of newWeek ? dwellers(state, object) : []) {
        const added = weeklyGrowth(state, object, creature.growth);
        available = addToArmy(available, creature.id, added);
        events.push({
          type: "creaturesGrew",
          townId: object.id,
          creature: creature.id,
          added,
          available: countIn(available, creature.id),
        });
      }
      return { ...object, builtToday: false, available };
    }),
  };
}
