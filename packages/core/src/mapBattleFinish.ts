/**
 * Конец боя внутри партии: итог переносится на карту.
 * Спецификации: docs/mechanics/23-map-battle.md, 40-two-players.md.
 */
import { isMachine } from "./battle/siege.ts";
import type { BattleState } from "./battle/types.ts";
import type { BattleOutcome, GameEvent, StackLoss } from "./events.ts";
import { POWER_PER_CREATURE } from "./guards.ts";
import { gainExperience } from "./hero.ts";
import { captureTown, settlePlayers } from "./players.ts";
import type { ArmyStack, GameState, HeroState, MapBattle, TownState } from "./types.ts";

/** Опыт за побеждённого героя и за взятый с боем город. Числа — из Heroes 3 (сверено по VCMI). */
const HERO_DEFEATED_EXPERIENCE = 500;
const TOWN_TAKEN_EXPERIENCE = 500;

type Side = 0 | 1;

/** Отряды стороны после боя: по местам в армии, без погибших. */
function survivors(battle: BattleState, side: Side, army: readonly ArmyStack[]): ArmyStack[] {
  const left = new Map(
    battle.stacks.filter((stack) => stack.side === side).map((stack) => [stack.slot, stack.count]),
  );
  return army
    .map((stack, slot) => ({ ...stack, count: left.get(slot) ?? 0 }))
    .filter((stack) => stack.count > 0);
}

/** Потери стороны по отрядам; бежавший теряет армию целиком. */
function lossesOf(battle: BattleState, side: Side, fled: boolean): StackLoss[] {
  return battle.stacks
    .filter((stack) => stack.side === side && !isMachine(stack))
    .toSorted((a, b) => a.slot - b.slot)
    .map((stack) => ({
      creature: stack.creature.id,
      lost: fled ? stack.initialCount : stack.initialCount - stack.count,
    }));
}

/** Опыт за убитых: здоровье существа × число убитых, по всем отрядам стороны (22-hero.md). */
function killExperience(battle: BattleState, side: Side): number {
  return battle.stacks
    .filter((stack) => stack.side === side && !isMachine(stack))
    .reduce((sum, stack) => sum + stack.creature.health * (stack.initialCount - stack.count), 0);
}

function heroOf(state: GameState, id: string | null): HeroState | undefined {
  return state.heroes.find((candidate) => candidate.id === id);
}

function townById(state: GameState, id: string | null): TownState | undefined {
  return state.objects.find(
    (object): object is TownState => object.type === "town" && object.id === id,
  );
}

function withHero(state: GameState, hero: HeroState): GameState {
  return {
    ...state,
    heroes: state.heroes.map((candidate) => (candidate.id === hero.id ? hero : candidate)),
  };
}

function withoutHero(state: GameState, id: string): GameState {
  return { ...state, heroes: state.heroes.filter((candidate) => candidate.id !== id) };
}

/** Победитель получает опыт и, может быть, уровни. */
function reward(state: GameState, hero: HeroState, amount: number, events: GameEvent[]): GameState {
  const gained = gainExperience(hero, amount, state.rng, events);
  return { ...withHero(state, gained.hero), rng: gained.rng };
}

/** Победа над охранником: его нет; шахту, на которой стоит герой, он занимает только теперь. */
function removeGuard(state: GameState, guardId: string, hero: HeroState, events: GameEvent[]) {
  const objects = state.objects
    .filter((object) => object.id !== guardId)
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
  return { ...state, objects };
}

/** Нападающий победил: обороняющегося нет, город захвачен, герой получает опыт. */
function finishWon(
  initial: GameState,
  battle: MapBattle,
  attacker: HeroState,
  events: GameEvent[],
): GameState {
  const fled = battle.state.result?.reason === "fled";
  const town = townById(initial, battle.townId);
  let state = initial;
  let hero: HeroState = { ...attacker, army: survivors(battle.state, 0, attacker.army) };
  let experience = killExperience(battle.state, 1);
  if (battle.guardId !== null) {
    events.push({ type: "guardDefeated", objectId: battle.guardId });
  }
  if (battle.defenderHeroId !== null) {
    events.push({
      type: "heroDied",
      heroId: battle.defenderHeroId,
      reason: fled ? "fled" : "destroyed",
    });
    state = withoutHero(state, battle.defenderHeroId);
    // За бежавшего героя опыта нет.
    experience += fled ? 0 : HERO_DEFEATED_EXPERIENCE;
  }
  if (town !== undefined) {
    experience += TOWN_TAKEN_EXPERIENCE;
    // Победитель входит в город.
    hero = { ...hero, x: town.x, y: town.y };
  }
  state = reward(withHero(state, hero), hero, experience, events);
  if (battle.guardId !== null) {
    state = removeGuard(state, battle.guardId, hero, events);
  }
  if (town !== undefined) {
    return captureTown(state, town, hero.owner, true, events);
  }
  return settlePlayers(state, events);
}

/** Нападающий разбит или бежал: его нет; у обороняющегося остаются выжившие. */
function finishLost(
  initial: GameState,
  battle: MapBattle,
  reason: "destroyed" | "fled",
  events: GameEvent[],
): GameState {
  events.push({ type: "heroDied", heroId: battle.heroId, reason });
  let state = withoutHero(initial, battle.heroId);
  const defender = heroOf(state, battle.defenderHeroId);
  if (defender !== undefined) {
    const kept = { ...defender, army: survivors(battle.state, 1, defender.army) };
    const experience =
      killExperience(battle.state, 0) + (reason === "fled" ? 0 : HERO_DEFEATED_EXPERIENCE);
    state = reward(withHero(state, kept), kept, experience, events);
  }
  const left = battle.state.stacks.find((stack) => stack.side === 1)?.count ?? 0;
  state = {
    ...state,
    objects: state.objects.map((object) => {
      if (object.id === battle.guardId && object.type === "guard") {
        return { ...object, count: left, power: left * POWER_PER_CREATURE };
      }
      if (object.id === battle.townId && object.type === "town" && defender === undefined) {
        return { ...object, garrison: survivors(battle.state, 1, object.garrison) };
      }
      return object;
    }),
  };
  return settlePlayers(state, events);
}

/** Бой окончен: переносит итог на карту. */
export function finishBattle(state: GameState, battle: MapBattle, events: GameEvent[]): GameState {
  const { result } = battle.state;
  const hero = heroOf(state, battle.heroId);
  if (result === null || hero === undefined) {
    return state;
  }
  const outcome: BattleOutcome =
    result.winner === 0 ? "won" : result.reason === "fled" ? "fled" : "lost";
  const defenderFled = result.winner === 0 && result.reason === "fled";
  const defenderLosses = lossesOf(battle.state, 1, defenderFled);
  events.push({
    type: "battleFinished",
    outcome,
    heroLosses: lossesOf(battle.state, 0, outcome === "fled"),
    guardLost: defenderLosses.reduce((sum, loss) => sum + loss.lost, 0),
    defenderLosses,
  });
  const done: GameState = { ...state, battle: null };
  return outcome === "won"
    ? finishWon(done, battle, hero, events)
    : finishLost(done, battle, outcome === "fled" ? "fled" : "destroyed", events);
}
