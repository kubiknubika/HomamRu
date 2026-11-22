/**
 * Помощники для тестов ядра. В игре не используются.
 */
import { CASTLE_TOP_BUILDINGS } from "./castleTopBuildings.ts";
import { GUILD_TOP } from "./guildTop.ts";
import { GLADE_BUILDINGS } from "./gladeBuildings.ts";
import { TOWER_BUILDINGS } from "./towerBuildings.ts";
import { INFERNO_BUILDINGS } from "./infernoBuildings.ts";
import { DUNGEON_BUILDINGS } from "./dungeonBuildings.ts";
import { NECROPOLIS_BUILDINGS } from "./necropolisBuildings.ts";
import { STRONGHOLD_BUILDINGS } from "./strongholdBuildings.ts";
import { FORTRESS_BUILDINGS } from "./fortressBuildings.ts";
import type { GameContent, HeroKind, OpponentRules, TavernRules } from "./tavernTypes.ts";
import { CREATURES } from "./battle/testkit.ts";
import { createGame, DAILY_MOVEMENT, heroIdOf } from "./game.ts";
import { NO_RESOURCES } from "./objects.ts";
import { SPELLS } from "./spellKit.ts";
import { createRng } from "./rng.ts";
import { STATE_VERSION } from "./types.ts";
import type {
  BuildingDefinition,
  GameState,
  MapObjectDefinition,
  Position,
  ResourceAmounts,
} from "./types.ts";

export { CREATURES } from "./battle/testkit.ts";
export { NEUTRAL_CREATURES } from "./battle/neutralKit.ts";
export { ALL_SPELLS, GAME_SPELLS, spell, SPELLS } from "./spellKit.ts";

export interface Picture {
  readonly state: GameState;
  /** Клетка, помеченная `T`; если её нет — клетка героя. */
  readonly target: Position;
}

function findSymbol(rows: readonly string[], symbol: string): Position | undefined {
  for (const [y, row] of rows.entries()) {
    const x = row.indexOf(symbol);
    if (x !== -1) {
      return { x, y };
    }
  }
  return undefined;
}

/** Открытое поле 8×8 с героем в левом верхнем углу — рисунок для `gameWith`. */
export const OPEN_FIELD = ["S.......", ...Array.from({ length: 7 }, () => "........")];

/** Армия героя в тестах, где армия не важна. */
export const TEST_ARMY = [{ creature: "militia", count: 10 }];

/** Герои для тестов: те же, что в data/heroes.yaml (32-hero-hire.md). */
export const HEROES: readonly HeroKind[] = [
  { id: "ratibor", name: "Ратибор", attack: 2, defense: 2, spellPower: 1, knowledge: 1 },
  { id: "velena", name: "Велена", attack: 1, defense: 3, spellPower: 1, knowledge: 1 },
  { id: "gorislav", name: "Горислав", attack: 3, defense: 1, spellPower: 1, knowledge: 1 },
  { id: "milava", name: "Милава", attack: 2, defense: 2, spellPower: 1, knowledge: 1 },
  { id: "svetozar", name: "Светозар", attack: 3, defense: 1, spellPower: 1, knowledge: 1 },
  { id: "zhdana", name: "Ждана", attack: 1, defense: 3, spellPower: 1, knowledge: 1 },
];

/** Правила таверны для тестов: те же, что в data/defaults.yaml. */
export const OPPONENT: OpponentRules = {
  advantagePercent: 150,
  buildOrder: [
    "town-hall",
    "militia-yard",
    "mage-guild",
    "slinger-range",
    "smithy",
    "barracks",
    "falcon-tower",
    // Верхних жилищ людей здесь нет: компьютер их не строит (74-second-castle.md).
    "citadel",
    "castle",
    "tavern",
    "fort",
    "mage-guild-2",
    "mage-guild-3",
    "mage-guild-4",
    "mage-guild-5",
  ],
};

export const TAVERN: TavernRules = {
  price: 2500,
  army: [
    { creature: "militia", min: 10, max: 20, chance: 100 },
    { creature: "slinger", min: 4, max: 7, chance: 88 },
    { creature: "falcon", min: 2, max: 3, chance: 25 },
  ],
};

/** Здания для тестов: те же, что в data/buildings.yaml (30-town.md). */
export const BUILDINGS: readonly BuildingDefinition[] = [
  ...GLADE_BUILDINGS,
  { id: "tavern", name: "Таверна", cost: { gold: 500, wood: 5 }, requires: [], tavern: true },
  { id: "town-hall", name: "Ратуша", cost: { gold: 2500 }, requires: ["tavern"], income: 1000 },
  { id: "fort", name: "Форт", cost: { gold: 5000, wood: 20, ore: 20 }, requires: [] },
  {
    id: "citadel",
    name: "Цитадель",
    cost: { gold: 2500, ore: 5 },
    requires: ["fort"],
    growthPercent: 50,
  },
  {
    id: "castle",
    name: "Замок",
    cost: { gold: 5000, wood: 10, ore: 10 },
    requires: ["citadel"],
    growthPercent: 100,
  },
  { id: "smithy", name: "Кузница", cost: { gold: 1000, wood: 5 }, requires: [] },
  { id: "market", name: "Рынок", cost: { gold: 500, wood: 5 }, requires: [], market: true },
  {
    id: "mage-guild",
    name: "Гильдия магов",
    cost: { gold: 2000, wood: 5, ore: 5 },
    requires: [],
    mageGuild: 1,
  },
  {
    id: "mage-guild-2",
    name: "Гильдия магов, уровень 2",
    cost: { gold: 1000, wood: 5, ore: 5, mercury: 4, sulfur: 4, crystal: 4, gems: 4 },
    requires: ["mage-guild"],
    mageGuild: 2,
  },
  {
    id: "mage-guild-3",
    name: "Гильдия магов, уровень 3",
    cost: { gold: 1000, wood: 5, ore: 5, mercury: 6, sulfur: 6, crystal: 6, gems: 6 },
    requires: ["mage-guild-2"],
    mageGuild: 3,
  },
  {
    id: "mage-guild-4",
    name: "Гильдия магов, уровень 4",
    cost: { gold: 1000, wood: 5, ore: 5, mercury: 8, sulfur: 8, crystal: 8, gems: 8 },
    requires: ["mage-guild-3"],
    mageGuild: 4,
  },
  // Пятый круг (docs/content/towns.md): один он открывает три заклинания пятого круга.
  ...GUILD_TOP,
  {
    id: "militia-yard",
    name: "Двор ополченцев",
    cost: { gold: 500, ore: 10 },
    requires: ["fort"],
    dwelling: "militia",
    faction: "castle",
  },
  {
    id: "slinger-range",
    name: "Стрельбище пращников",
    cost: { gold: 1000, wood: 5, ore: 5 },
    requires: ["militia-yard"],
    dwelling: "slinger",
    faction: "castle",
  },
  {
    id: "barracks",
    name: "Казарма",
    cost: { gold: 2000, ore: 5 },
    requires: ["smithy", "militia-yard"],
    dwelling: "armsman",
    faction: "castle",
  },
  {
    id: "falcon-tower",
    name: "Соколиная башня",
    cost: { gold: 1000, ore: 5 },
    requires: ["barracks"],
    dwelling: "falcon",
    faction: "castle",
  },
  // Жилища людей 5–7 уровней: в конце списка, чтобы порядок прежних зданий не менялся.
  ...CASTLE_TOP_BUILDINGS,
  // Третий замок — в конце: порядок значим для тестов, которые берут первые здания списка.
  ...TOWER_BUILDINGS,
  ...INFERNO_BUILDINGS,
  ...DUNGEON_BUILDINGS,
  ...NECROPOLIS_BUILDINGS,
  ...STRONGHOLD_BUILDINGS,
  ...FORTRESS_BUILDINGS,
];

/**
 * Строит состояние по рисунку из спецификации: `S` — герой, `T` — цель,
 * `B` — герой второго игрока, `#` — преграда, `.` — земля.
 * Размер карты не проверяется: рисунки в примерах меньше наименьшей карты.
 */
export function fromPicture(rows: readonly string[]): Picture {
  const start = findSymbol(rows, "S");
  if (start === undefined) {
    throw new Error("На рисунке нет героя (S).");
  }
  const second = findSymbol(rows, "B");
  const positions = second === undefined ? [start] : [start, second];
  const state: GameState = {
    version: STATE_VERSION,
    rng: createRng(1),
    map: {
      id: "picture",
      name: "Рисунок",
      width: rows[0]?.length ?? 0,
      height: rows.length,
      terrain: rows.map((row) => row.replaceAll(/[STB]/g, ".")),
      starts: positions,
    },
    players: positions.map((_, id) => ({
      id,
      kind: "human" as const,
      eliminated: false,
      townlessDays: null,
      resources: NO_RESOURCES,
      tavern: [],
    })),
    heroes: positions.map((position, owner) => ({
      id: heroIdOf(owner),
      owner,
      kind: "ratibor",
      name: "Ратибор",
      x: position.x,
      y: position.y,
      movement: DAILY_MOVEMENT,
      attack: 0,
      defense: 0,
      spellPower: 0,
      knowledge: 0,
      mana: 0,
      book: false,
      spells: [],
      skills: [],
      skillOffer: [],
      visions: 0,
      disguise: 0,
      skillsOwed: 0,
      army: TEST_ARMY,
      experience: 0,
      level: 1,
    })),
    objects: [],
    day: 1,
    currentPlayer: 0,
    creatures: CREATURES,
    buildings: BUILDINGS,
    heroKinds: HEROES,
    spells: SPELLS,
    tavern: TAVERN,
    opponent: OPPONENT,
    battle: null,
    outcome: null,
    winner: null,
  };
  return { state, target: findSymbol(rows, "T") ?? start };
}

/** Открытое поле заданного размера с героем в левом верхнем углу. */
export function openField(size: number): GameState {
  const rows = Array.from({ length: size }, (_, y) => (y === 0 ? "S" : ".") + ".".repeat(size - 1));
  return fromPicture(rows).state;
}

/** Контент игры для тестов. */
export const CONTENT: GameContent = {
  creatures: CREATURES,
  buildings: BUILDINGS,
  heroes: HEROES,
  spells: SPELLS,
  tavern: TAVERN,
  opponent: OPPONENT,
};

/**
 * Партия для тестов этапа 3: карта рисунком (`S` — герой), объекты и армия героя.
 * Армия записывается как в тестах боя: `"militia:20"`.
 */
export function gameWith(
  rows: readonly string[],
  objects: readonly MapObjectDefinition[],
  options: {
    army?: readonly string[];
    attack?: number;
    defense?: number;
    seed?: number;
    resources?: ResourceAmounts;
  } = {},
): GameState {
  const start = findSymbol(rows, "S");
  if (start === undefined) {
    throw new Error("На рисунке нет героя (S).");
  }
  const army = (options.army ?? ["militia:10"]).map((entry) => {
    const [creature = "", count = "1"] = entry.split(":");
    return { creature, count: Number(count) };
  });
  const created = createGame(
    {
      id: "picture",
      name: "Рисунок",
      terrain: rows.map((row) => row.replaceAll("S", ".")),
      players: [
        {
          // Без названных чисел — ноль, а не числа героя из списка: так удобнее считать бой.
          hero: { ...start, attack: options.attack ?? 0, defense: options.defense ?? 0, army },
          resources: options.resources,
        },
      ],
      objects,
    },
    options.seed ?? 1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => `${error.field}: ${error.message}`).join("; "));
  }
  return created.state;
}

/** Ставит героя в клетку в обход правил — для положений, до которых долго идти. */
export function placeHero(state: GameState, x: number, y: number, movement?: number): GameState {
  return {
    ...state,
    heroes: state.heroes.map((hero, index) =>
      index === 0 ? { ...hero, x, y, movement: movement ?? hero.movement } : hero,
    ),
  };
}
