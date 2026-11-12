/**
 * Бой внутри партии: начало, команды, итог.
 * Спецификация: docs/mechanics/23-map-battle.md.
 */
import { townOf } from "./town.ts";
import { applyBattleCommand } from "./battle/commands.ts";
import { createBattle } from "./battle/create.ts";
import { BATTLE_HEIGHT, cellIndex } from "./battle/hex.ts";
import type { Cell } from "./battle/hex.ts";
import type { BattleCommand, BattleState } from "./battle/types.ts";
import type { BattleOutcome, GameEvent } from "./events.ts";
import { POWER_PER_CREATURE } from "./guards.ts";
import { ARMY_LUCK, ARMY_MORALE, gainExperience } from "./hero.ts";
import { nextInt, nextUint32 } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { reject } from "./types.ts";
import type { CommandResult, GameState, GuardState, HeroState, MapBattle } from "./types.ts";

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

/**
 * Начинает бой героя с охранником: герой — нападающий. Возвращает состояние с полем `battle`;
 * события дописываются в список.
 */
export function startBattle(
  state: GameState,
  hero: HeroState,
  guard: GuardState,
  events: GameEvent[],
): GameState {
  const { seed, obstacles, rng } = rollBattle(state.rng);
  const created = createBattle(
    {
      id: `${hero.id}-${guard.id}`,
      name: "Бой с охранником",
      obstacles,
      attacker: {
        hero: { attack: hero.attack, defense: hero.defense },
        morale: ARMY_MORALE,
        luck: ARMY_LUCK,
        army: hero.army,
      },
      defender: {
        morale: ARMY_MORALE,
        luck: ARMY_LUCK,
        army: [{ creature: guard.creature, count: guard.count }],
      },
    },
    state.creatures,
    seed,
  );
  if (!created.ok) {
    const reasons = created.errors.map((error) => `${error.field}: ${error.message}`).join("; ");
    throw new Error(`Бой героя ${hero.id} с охранником ${guard.id} не создан: ${reasons}`);
  }
  events.push({ type: "battleStarted", heroId: hero.id, guardId: guard.id });
  events.push(...created.events.map((event): GameEvent => ({ type: "battle", event })));
  return { ...state, rng, battle: { heroId: hero.id, guardId: guard.id, state: created.state } };
}

/** Сколько существ осталось в отрядах стороны, по местам в армии. */
function survivorsOf(battle: BattleState, side: 0 | 1): Map<number, number> {
  return new Map(
    battle.stacks.filter((stack) => stack.side === side).map((stack) => [stack.slot, stack.count]),
  );
}

/** Победа: охранника нет, в армии выжившие, герой получает опыт и шахту, на которой стоит. */
function finishWon(state: GameState, battle: MapBattle, events: GameEvent[]): GameState {
  const hero = state.heroes.find((candidate) => candidate.id === battle.heroId);
  if (hero === undefined) {
    throw new Error(`Героя ${battle.heroId} нет в партии.`);
  }
  const left = survivorsOf(battle.state, 0);
  const army = hero.army
    .map((stack, slot) => ({ ...stack, count: left.get(slot) ?? 0 }))
    .filter((stack) => stack.count > 0);
  events.push({ type: "guardDefeated", objectId: battle.guardId });
  // Опыт: здоровье существа × число убитых, по всем убитым существам врага.
  const experience = battle.state.stacks
    .filter((stack) => stack.side === 1)
    .reduce((sum, stack) => sum + stack.creature.health * (stack.initialCount - stack.count), 0);
  const gained = gainExperience({ ...hero, army }, experience, state.rng, events);
  // Шахту в зоне охранника герой занимает только после победы.
  const objects = state.objects
    .filter((object) => object.id !== battle.guardId)
    .map((object) => {
      const here = object.x === hero.x && object.y === hero.y;
      if (object.type !== "mine" || !here || object.owner === hero.owner) {
        return object;
      }
      events.push({
        type: "mineCaptured",
        objectId: object.id,
        owner: hero.owner,
        previousOwner: object.owner,
      });
      return { ...object, owner: hero.owner };
    });
  return {
    ...state,
    rng: gained.rng,
    objects,
    heroes: state.heroes.map((candidate) => (candidate.id === hero.id ? gained.hero : candidate)),
    battle: null,
  };
}

/**
 * Поражение или бегство: героя нет, у охранника выжившие. Партия окончена, только если
 * у игрока нет города (32-hero-hire.md).
 */
function finishLost(
  state: GameState,
  battle: MapBattle,
  reason: "destroyed" | "fled",
  events: GameEvent[],
): GameState {
  const left = survivorsOf(battle.state, 1).get(0) ?? 0;
  events.push({ type: "heroDied", heroId: battle.heroId, reason });
  const owner = state.heroes.find((candidate) => candidate.id === battle.heroId)?.owner;
  const over = owner === undefined || townOf(state, owner) === undefined;
  if (over) {
    events.push({ type: "gameOver", outcome: "defeat" });
  }
  return {
    ...state,
    objects: state.objects.map((object) =>
      object.id === battle.guardId && object.type === "guard"
        ? { ...object, count: left, power: left * POWER_PER_CREATURE }
        : object,
    ),
    heroes: state.heroes.filter((candidate) => candidate.id !== battle.heroId),
    battle: null,
    outcome: over ? "defeat" : state.outcome,
  };
}

/** Бой окончен: переносит итог на карту. */
function finishBattle(state: GameState, battle: MapBattle, events: GameEvent[]): GameState {
  const { result } = battle.state;
  const hero = state.heroes.find((candidate) => candidate.id === battle.heroId);
  if (result === null || hero === undefined) {
    return state;
  }
  const left = survivorsOf(battle.state, 0);
  const outcome: BattleOutcome =
    result.winner === 0 ? "won" : result.reason === "fled" ? "fled" : "lost";
  const guardStack = battle.state.stacks.find((stack) => stack.side === 1);
  events.push({
    type: "battleFinished",
    outcome,
    heroLosses: hero.army.map((stack, slot) => ({
      creature: stack.creature,
      // Бежавший герой теряет армию целиком.
      lost: outcome === "fled" ? stack.count : stack.count - (left.get(slot) ?? 0),
    })),
    guardLost: (guardStack?.initialCount ?? 0) - (guardStack?.count ?? 0),
  });
  return outcome === "won"
    ? finishWon(state, battle, events)
    : finishLost(state, battle, outcome === "fled" ? "fled" : "destroyed", events);
}

/** Команда боя внутри партии. */
export function applyMapBattleCommand(state: GameState, command: BattleCommand): CommandResult {
  const { battle } = state;
  if (battle === null) {
    return reject("NO_BATTLE", "Боя сейчас нет.");
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
