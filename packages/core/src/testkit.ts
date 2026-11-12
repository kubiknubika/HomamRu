/**
 * Помощники для тестов ядра. В игре не используются.
 */
import type { GameContent, HeroKind, TavernRules } from "./tavernTypes.ts";
import { CREATURES } from "./battle/testkit.ts";
import { createGame, DAILY_MOVEMENT, heroIdOf } from "./game.ts";
import { NO_RESOURCES } from "./objects.ts";
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
  { id: "ratibor", name: "Ратибор", attack: 2, defense: 2 },
  { id: "velena", name: "Велена", attack: 1, defense: 3 },
  { id: "gorislav", name: "Горислав", attack: 3, defense: 1 },
  { id: "milava", name: "Милава", attack: 2, defense: 2 },
  { id: "svetozar", name: "Светозар", attack: 3, defense: 1 },
  { id: "zhdana", name: "Ждана", attack: 1, defense: 3 },
];

/** Правила таверны для тестов: те же, что в data/defaults.yaml. */
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
  {
    id: "militia-yard",
    name: "Двор ополченцев",
    cost: { gold: 500, ore: 10 },
    requires: ["fort"],
    dwelling: "militia",
  },
  {
    id: "slinger-range",
    name: "Стрельбище пращников",
    cost: { gold: 1000, wood: 5, ore: 5 },
    requires: ["militia-yard"],
    dwelling: "slinger",
  },
  {
    id: "barracks",
    name: "Казарма",
    cost: { gold: 2000, ore: 5 },
    requires: ["smithy", "militia-yard"],
    dwelling: "armsman",
  },
  {
    id: "falcon-tower",
    name: "Соколиная башня",
    cost: { gold: 1000, ore: 5 },
    requires: ["barracks"],
    dwelling: "falcon",
  },
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
    tavern: TAVERN,
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
  tavern: TAVERN,
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
