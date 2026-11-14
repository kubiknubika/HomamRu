/**
 * Бой внутри партии: начало, команды, итог.
 * Спецификации: docs/mechanics/23-map-battle.md, 40-two-players.md.
 */
import { applyBattleCommand } from "./battle/commands.ts";
import { createBattle } from "./battle/create.ts";
import { BATTLE_HEIGHT, cellIndex } from "./battle/hex.ts";
import type { Cell } from "./battle/hex.ts";
import { FORTIFICATIONS } from "./battle/siege.ts";
import type { BattleCommand, BattleDefinition } from "./battle/types.ts";
import { mergeArmy } from "./army.ts";
import type { GameEvent } from "./events.ts";
import { ARMY_LUCK, ARMY_MORALE } from "./hero.ts";
import { finishBattle } from "./mapBattleFinish.ts";
import { nextInt, nextUint32 } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { reject } from "./types.ts";
import type {
  ArmyStack,
  CommandResult,
  GameState,
  GuardState,
  HeroState,
  MapBattle,
  TownState,
} from "./types.ts";

/** Случайные препятствия: от 0 до 6 клеток в столбцах со 2-го по 12-й. */
const MAX_OBSTACLES = 6;
const OBSTACLE_FIRST_COL = 2;
const OBSTACLE_LAST_COL = 12;

/** Сид боя и препятствия — из генератора партии: сначала сид, потом число клеток, потом клетки. */
function rollBattle(initialRng: RngState): { seed: number; obstacles: Cell[]; rng: RngState } {
  const seedRoll = nextUint32(initialRng);
  const countRoll = nextInt(seedRoll.rng, 0, MAX_OBSTACLES);
  let { rng } = countRoll;
  const cells = new Map<number, Cell>();
  while (cells.size < countRoll.value) {
    const col = nextInt(rng, OBSTACLE_FIRST_COL, OBSTACLE_LAST_COL);
    const row = nextInt(col.rng, 0, BATTLE_HEIGHT - 1);
    ({ rng } = row);
    const cell = { col: col.value, row: row.value };
    // Клетка, выпавшая второй раз, бросается заново: препятствий ровно столько, сколько выпало.
    cells.set(cellIndex(cell), cell);
  }
  return { seed: seedRoll.value, obstacles: [...cells.values()], rng };
}

/** На кого напал герой: охранник, чужой герой (в поле или в своём городе) или город с гарнизоном. */
export type BattleTarget =
  | { readonly guard: GuardState }
  | { readonly hero: HeroState; readonly town: TownState | undefined }
  | { readonly town: TownState };

interface Defender {
  readonly state: GameState;
  readonly army: readonly ArmyStack[];
  readonly hero: HeroState | undefined;
  readonly ids: Pick<MapBattle, "guardId" | "defenderHeroId" | "townId">;
}

/** Собирает обороняющегося; гарнизон города перед боем переходит к герою, который в нём стоит. */
function defenderOf(state: GameState, target: BattleTarget, events: GameEvent[]): Defender {
  if ("guard" in target) {
    const { id, creature, count } = target.guard;
    const ids = { guardId: id, defenderHeroId: null, townId: null };
    return { state, army: [{ creature, count }], hero: undefined, ids };
  }
  if (!("hero" in target)) {
    const ids = { guardId: null, defenderHeroId: null, townId: target.town.id };
    return { state, army: target.town.garrison, hero: undefined, ids };
  }
  const { hero, town } = target;
  const ids = { guardId: null, defenderHeroId: hero.id, townId: town?.id ?? null };
  if (town === undefined || town.garrison.length === 0) {
    return { state, army: hero.army, hero, ids };
  }
  const joined = { ...hero, army: mergeArmy([...hero.army, ...town.garrison]) };
  events.push({ type: "garrisonJoined", townId: town.id, heroId: hero.id, army: town.garrison });
  const merged: GameState = {
    ...state,
    heroes: state.heroes.map((candidate) => (candidate.id === hero.id ? joined : candidate)),
    objects: state.objects.map((object) =>
      object.id === town.id && object.type === "town" ? { ...object, garrison: [] } : object,
    ),
  };
  return { state: merged, army: joined.army, hero: joined, ids };
}

const FORTIFICATION_IDS: readonly string[] = FORTIFICATIONS;

/** Осада: бой за город с фортом. Здания считаются без форта, цитадели и замка (50-siege.md). */
function siegeOf(state: GameState, townId: string | null): BattleDefinition["siege"] {
  const town = state.objects.find((object) => object.id === townId);
  if (town?.type !== "town") {
    return undefined;
  }
  const fortification = FORTIFICATIONS.findLast((id) => town.buildings.includes(id));
  return fortification === undefined
    ? undefined
    : {
        fortification,
        buildings: town.buildings.filter((id) => !FORTIFICATION_IDS.includes(id)).length,
      };
}

/**
 * Начинает бой: герой — нападающий. Возвращает состояние с полем `battle`;
 * события дописываются в список.
 */
export function startBattle(
  initial: GameState,
  hero: HeroState,
  target: BattleTarget,
  events: GameEvent[],
): GameState {
  const defender = defenderOf(initial, target, events);
  const { state, ids } = defender;
  const { seed, obstacles, rng } = rollBattle(state.rng);
  const siege = siegeOf(state, ids.townId);
  const against = ids.guardId ?? ids.defenderHeroId ?? ids.townId ?? "";
  const created = createBattle(
    {
      id: `${hero.id}-${against}`,
      name: "Бой на карте",
      // На поле осады препятствий нет; жребий препятствий всё равно брошен, чтобы порядок случайных чисел не зависел от вида боя.
      obstacles: siege === undefined ? obstacles : [],
      ...(siege === undefined ? {} : { siege }),
      attacker: {
        hero: { attack: hero.attack, defense: hero.defense },
        morale: ARMY_MORALE,
        luck: ARMY_LUCK,
        army: hero.army,
      },
      defender: {
        ...(defender.hero === undefined
          ? {}
          : { hero: { attack: defender.hero.attack, defense: defender.hero.defense } }),
        morale: ARMY_MORALE,
        luck: ARMY_LUCK,
        army: defender.army,
      },
    },
    state.creatures,
    seed,
  );
  if (!created.ok) {
    const reasons = created.errors.map((error) => `${error.field}: ${error.message}`).join("; ");
    throw new Error(`Бой героя ${hero.id} с ${against} не создан: ${reasons}`);
  }
  events.push({ type: "battleStarted", heroId: hero.id, ...ids });
  events.push(...created.events.map((event): GameEvent => ({ type: "battle", event })));
  return { ...state, rng, battle: { heroId: hero.id, ...ids, state: created.state } };
}

/** Команда боя внутри партии. */
export function applyMapBattleCommand(state: GameState, command: BattleCommand): CommandResult {
  const { battle } = state;
  if (battle === null) {
    return reject("NO_BATTLE", "Боя сейчас нет.");
  }
  if (command.type === "battleFlee" && command.side === 1 && battle.townId !== null) {
    return reject("CANNOT_FLEE", "Обороняющийся в городе бежать не может.");
  }
  const result = applyBattleCommand(battle.state, command);
  if (!result.ok) {
    return result;
  }
  const events = result.events.map((event): GameEvent => ({ type: "battle", event }));
  const next: MapBattle = { ...battle, state: result.state };
  const ongoing: GameState = { ...state, battle: next };
  if (result.state.result === null) {
    return { ok: true, state: ongoing, events };
  }
  return { ok: true, state: finishBattle(ongoing, next, events), events };
}
