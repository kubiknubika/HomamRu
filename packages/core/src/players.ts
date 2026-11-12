/**
 * Игроки: выбывание, семь дней без города, конец партии, захват города.
 * Спецификации: docs/mechanics/40-two-players.md, 41-victory.md.
 */
import { refreshTavern } from "./tavern.ts";
import type { GameEvent, GameState, PlayerState, TownState } from "./types.ts";

/** Сколько своих ходов игрок может закончить без города. Число — из Heroes 3. */
const TOWNLESS_DAYS = 7;

function hasTown(state: GameState, player: number): boolean {
  return state.objects.some((object) => object.type === "town" && object.owner === player);
}

function hasHero(state: GameState, player: number): boolean {
  return state.heroes.some((hero) => hero.owner === player);
}

function withPlayer(
  state: GameState,
  player: number,
  change: (old: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === player ? change(candidate) : candidate,
    ),
  };
}

/** Игрок выбывает: его героя больше нет на карте, в очереди ходов его пропускают. */
function eliminate(
  state: GameState,
  player: number,
  reason: "nothing" | "townless",
  events: GameEvent[],
): GameState {
  events.push({ type: "playerEliminated", player, reason });
  const out = withPlayer(state, player, (old) => ({
    ...old,
    eliminated: true,
    townlessDays: null,
    tavern: [],
  }));
  return { ...out, heroes: out.heroes.filter((hero) => hero.owner !== player) };
}

/**
 * Проверяет, кто выбыл и не кончилась ли партия. Зовётся после всего, что отнимает
 * героя или город: конца боя, захвата города, конца хода игрока без города.
 */
export function settlePlayers(initial: GameState, events: GameEvent[]): GameState {
  let state = initial;
  for (const player of initial.players) {
    if (!player.eliminated && !hasTown(state, player.id) && !hasHero(state, player.id)) {
      state = eliminate(state, player.id, "nothing", events);
    }
  }
  if (state.outcome !== null) {
    return state;
  }
  const alive = state.players.filter((player) => !player.eliminated);
  if (state.players.length === 1) {
    if (alive.length > 0) {
      return state;
    }
    events.push({ type: "gameOver", outcome: "defeat", winner: null });
    return { ...state, outcome: "defeat" };
  }
  if (alive.length > 1) {
    return state;
  }
  const winner = alive[0]?.id ?? null;
  // Выбыли все сразу — победителя нет.
  const outcome = winner === null ? "defeat" : "victory";
  events.push({ type: "gameOver", outcome, winner });
  return { ...state, outcome, winner };
}

/**
 * Конец хода игрока без города: счётчик растёт; на седьмом таком ходу игрок выбывает.
 * Так в Heroes 3: счёт идёт в конце хода самого игрока.
 */
export function countTownlessDay(state: GameState, player: number, events: GameEvent[]): GameState {
  const current = state.players[player];
  const days = current?.townlessDays ?? null;
  if (days === null || current?.eliminated === true) {
    return state;
  }
  const next = days + 1;
  events.push({ type: "townlessCountdown", player, daysLeft: TOWNLESS_DAYS - next });
  const counted = withPlayer(state, player, (old) => ({ ...old, townlessDays: next }));
  if (next < TOWNLESS_DAYS) {
    return counted;
  }
  return settlePlayers(eliminate(counted, player, "townless", events), events);
}

/**
 * Город переходит к новому владельцу. Постройки и ждущие найма существа остаются,
 * гарнизон пуст. Прежний владелец без городов получает отсчёт, новый — таверну.
 */
export function captureTown(
  state: GameState,
  town: TownState,
  owner: number,
  fought: boolean,
  events: GameEvent[],
): GameState {
  const previousOwner = town.owner;
  const hadTown = hasTown(state, owner);
  events.push({ type: "townCaptured", townId: town.id, owner, previousOwner, fought });
  let next: GameState = {
    ...state,
    objects: state.objects.map((object) =>
      object.id === town.id && object.type === "town" ? { ...object, owner, garrison: [] } : object,
    ),
  };
  next = withPlayer(next, owner, (old) => ({ ...old, townlessDays: null }));
  if (!hadTown) {
    // У игрока не было таверны: герои в ней выбираются сразу (32-hero-hire.md).
    next = refreshTavern(next, owner, events);
  }
  if (!hasTown(next, previousOwner)) {
    next = withPlayer(next, previousOwner, (old) => ({ ...old, townlessDays: 0, tavern: [] }));
    events.push({ type: "townlessCountdown", player: previousOwner, daysLeft: TOWNLESS_DAYS });
  }
  return settlePlayers(next, events);
}

/** Следующий по очереди играющий после данного; `null` — день кончился. */
export function nextPlayerAfter(state: GameState, player: number): number | null {
  const next = state.players.find((candidate) => candidate.id > player && !candidate.eliminated);
  return next?.id ?? null;
}

/** Первый играющий в очереди. */
export function firstPlayer(state: GameState): number {
  return state.players.find((candidate) => !candidate.eliminated)?.id ?? 0;
}
