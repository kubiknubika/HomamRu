/**
 * Кто на экране игрок, чей ход и что будет в конце пути: вопросы к состоянию партии.
 * Правил игры здесь нет. Спецификация: docs/mechanics/43-opponent-screen.md.
 */
import { cellsAlong, findPath, guardWatching, objectAt, TOWNLESS_DAYS } from "@homamru/core";
import type {
  GameState,
  GuardState,
  HeroState,
  PathResult,
  Position,
  TownState,
} from "@homamru/core";

/** Игрок, который сидит за экраном: первый человек в списке; на карте без людей — первый. */
export function humanOf(state: GameState): number {
  return state.players.find((player) => player.kind === "human")?.id ?? 0;
}

/** Герой игрока за экраном. */
export function activeHero(state: GameState): HeroState | undefined {
  const me = humanOf(state);
  return state.heroes.find((hero) => hero.owner === me);
}

/** Сейчас ходит компьютерный игрок: управление карты не работает. */
export function computerToMove(state: GameState): boolean {
  const current = state.players.find((player) => player.id === state.currentPlayer);
  return state.outcome === null && current?.kind === "computer";
}

/** Сторона игрока в идущем бою партии: 0 — напал он, 1 — напали на него; `null` — бой не его. */
export function battleSideOf(state: GameState): 0 | 1 | null {
  const { battle } = state;
  const me = humanOf(state);
  if (battle === null || state.players[me]?.kind !== "human") {
    return null;
  }
  const ownerOf = (id: string | null): number | undefined =>
    state.heroes.find((hero) => hero.id === id)?.owner;
  if (ownerOf(battle.heroId) === me) {
    return 0;
  }
  const town = state.objects.find((object) => object.id === battle.townId);
  const defender = ownerOf(battle.defenderHeroId) ?? (town?.type === "town" ? town.owner : null);
  return defender === me ? 1 : null;
}

/** Что случится, если герой пройдёт путь до конца. */
export type Fight =
  | { readonly kind: "guard"; readonly guard: GuardState }
  /** Бой с героем противника; если он в своём городе — вместе с гарнизоном. */
  | { readonly kind: "hero"; readonly hero: HeroState; readonly town: TownState | null }
  /** Бой с гарнизоном города противника. */
  | { readonly kind: "town"; readonly town: TownState }
  /** Пустой город противника: захват без боя. */
  | { readonly kind: "capture"; readonly town: TownState };

/** Клетка, которую выбрал игрок, и путь до неё. */
export interface Selection {
  readonly target: Position;
  readonly path: PathResult;
  /** Чем кончится путь, если пройти его целиком; `null` — ничем особенным. */
  readonly fight: Fight | null;
}

export function sameCell(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function fightAhead(
  state: GameState,
  hero: HeroState,
  target: Position,
  path: PathResult,
): Fight | null {
  if (!path.found) {
    return null;
  }
  const aimed = objectAt(state, target.x, target.y);
  const enemy = state.heroes.find((other) => other.owner !== hero.owner && sameCell(other, target));
  if (enemy !== undefined) {
    const home = aimed?.type === "town" && aimed.owner === enemy.owner ? aimed : null;
    return { kind: "hero", hero: enemy, town: home };
  }
  if (aimed?.type === "town" && aimed.owner !== hero.owner) {
    return { kind: aimed.garrison.length > 0 ? "town" : "capture", town: aimed };
  }
  if (aimed?.type === "guard") {
    return { kind: "guard", guard: aimed };
  }
  // Цель — клетка зоны охранника: бой будет с ним.
  const end = cellsAlong(hero, path.steps).at(-1);
  const guard = end === undefined ? undefined : guardWatching(state, end.x, end.y);
  return guard === undefined ? null : { kind: "guard", guard };
}

export function select(state: GameState, target: Position): Selection | null {
  const hero = activeHero(state);
  if (hero === undefined || sameCell(hero, target)) {
    return null;
  }
  const path = findPath(state, hero.id, target);
  return { target, path, fight: fightAhead(state, hero, target, path) };
}

/** Чем кончилась партия для игрока за экраном. */
export type Ending =
  | { readonly kind: "victory"; readonly days: number }
  | { readonly kind: "defeat"; readonly reason: "nothing" | "townless" };

export function endingOf(state: GameState): Ending | null {
  if (state.outcome === null) {
    return null;
  }
  const me = humanOf(state);
  if (state.outcome === "victory" && state.winner === me) {
    return { kind: "victory", days: state.day };
  }
  const townless = state.players[me]?.townlessDays === TOWNLESS_DAYS;
  return { kind: "defeat", reason: townless ? "townless" : "nothing" };
}

/** Сколько дней осталось игроку без города; `null` — отсчёта нет. */
export function townlessLeft(state: GameState): number | null {
  const player = state.players[humanOf(state)];
  const days = player?.townlessDays ?? null;
  return days === null || player?.eliminated === true ? null : TOWNLESS_DAYS - days;
}
