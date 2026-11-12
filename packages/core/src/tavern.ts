/**
 * Таверна и наём героя. Спецификация: docs/mechanics/32-hero-hire.md.
 */
import { DAILY_MOVEMENT, heroIdOf } from "./heroIds.ts";
import { nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import type { HireHeroCommand, TavernOffer } from "./tavernTypes.ts";
import { pay, townOf } from "./town.ts";
import type { TownState } from "./types.ts";
import { reject } from "./types.ts";
import type { ArmyStack, CommandResult, GameEvent, GameState, HeroState } from "./types.ts";

/** Сколько героев ждёт в таверне. */
export const TAVERN_OFFERS = 2;

const CHANCE_ROLL_MAX = 100;

interface Rolled<T> {
  readonly value: T;
  readonly rng: RngState;
}

/** Случайная армия героя таверны: один бросок решает состав, размер отряда — отдельный бросок. */
function rollArmy(state: GameState, rng: RngState): Rolled<ArmyStack[]> {
  const chance = nextInt(rng, 1, CHANCE_ROLL_MAX);
  let next = chance.rng;
  const army: ArmyStack[] = [];
  for (const rule of state.tavern.army) {
    if (chance.value <= rule.chance) {
      const count = nextInt(next, rule.min, rule.max);
      next = count.rng;
      army.push({ creature: rule.creature, count: count.value });
    }
  }
  return { value: army, rng: next };
}

/** Случайный герой для таверны: не из названных. `null` — выбирать не из кого. */
function rollOffer(
  state: GameState,
  rng: RngState,
  taken: readonly (string | undefined)[],
): Rolled<TavernOffer | null> {
  const free = state.heroKinds.filter((kind) => !taken.includes(kind.id));
  if (free.length === 0) {
    return { value: null, rng };
  }
  const pick = nextInt(rng, 0, free.length - 1);
  const army = rollArmy(state, pick.rng);
  return { value: { kind: free[pick.value]?.id ?? "", army: army.value }, rng: army.rng };
}

function withOffers(state: GameState, player: number, offers: readonly TavernOffer[]): GameState {
  return {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === player ? { ...candidate, tavern: offers } : candidate,
    ),
  };
}

/**
 * Заново выбирает героев таверны игрока: двух разных, не считая героя, который у него сейчас.
 * У игрока без города таверны нет.
 */
export function refreshTavern(state: GameState, player: number, events: GameEvent[]): GameState {
  if (townOf(state, player) === undefined) {
    return state;
  }
  const own = state.heroes.find((hero) => hero.owner === player)?.kind;
  let { rng } = state;
  const offers: TavernOffer[] = [];
  for (let index = 0; index < TAVERN_OFFERS; index += 1) {
    const rolled = rollOffer(state, rng, [own, ...offers.map((offer) => offer.kind)]);
    rng = rolled.rng;
    if (rolled.value !== null) {
      offers.push(rolled.value);
    }
  }
  events.push({ type: "tavernChanged", player, offers });
  return withOffers({ ...state, rng }, player, offers);
}

/** Команда «нанять героя». Общие проверки (игрок, очередь хода, бой) уже сделаны. */
export function applyHireHero(state: GameState, command: HireHeroCommand): CommandResult {
  const { player, townId } = command;
  const town = state.objects.find(
    (object): object is TownState =>
      object.type === "town" && object.id === townId && object.owner === player,
  );
  if (town === undefined) {
    return reject("NO_TOWN", `Города ${townId} у игрока ${player + 1} нет.`);
  }
  const tavern = state.buildings.some(
    (building) => building.tavern === true && town.buildings.includes(building.id),
  );
  if (!tavern) {
    return reject("NO_TAVERN", "В городе нет таверны.");
  }
  if (state.heroes.some((hero) => hero.owner === player)) {
    return reject("HERO_EXISTS", "Герой у игрока уже есть.");
  }
  const offers = state.players[player]?.tavern ?? [];
  const offer = offers[command.offer];
  const kind = state.heroKinds.find((candidate) => candidate.id === offer?.kind);
  if (offer === undefined || kind === undefined) {
    return reject("BAD_OFFER", `Героя с номером ${command.offer} в таверне нет.`);
  }
  const cost = state.tavern.price;
  if ((state.players[player]?.resources.gold ?? 0) < cost) {
    return reject("NOT_ENOUGH_RESOURCES", `Нужно золота: ${cost}.`);
  }
  const hero: HeroState = {
    id: heroIdOf(player),
    owner: player,
    kind: kind.id,
    name: kind.name,
    x: town.x,
    y: town.y,
    movement: DAILY_MOVEMENT,
    attack: kind.attack,
    defense: kind.defense,
    army: offer.army,
    experience: 0,
    level: 1,
  };
  const paid = pay(state, player, { gold: cost });
  // Нанятого сразу заменяет другой: не он сам и не тот, кто ждёт на втором месте.
  const others = offers.filter((_, index) => index !== command.offer);
  const rolled = rollOffer(paid, paid.rng, [kind.id, ...others.map((other) => other.kind)]);
  const next = offers.flatMap((old, index) =>
    index === command.offer ? (rolled.value === null ? [] : [rolled.value]) : [old],
  );
  const events: GameEvent[] = [
    { type: "heroHired", heroId: hero.id, hero: kind.id, townId, cost, army: offer.army },
    { type: "tavernChanged", player, offers: next },
  ];
  const hired = { ...paid, rng: rolled.rng, heroes: [...paid.heroes, hero] };
  return { ok: true, state: withOffers(hired, player, next), events };
}
