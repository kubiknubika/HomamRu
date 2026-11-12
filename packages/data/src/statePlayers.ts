/**
 * Чтение сохранения: игроки и бой этапа 5 (docs/mechanics/40-two-players.md, 41-victory.md).
 */
import type { ArmyStack, GameState, HeroState, MapBattle, ObjectState } from "@homamru/core";
import { DEFAULTS } from "./stateSchemas.ts";
import type { LooseState } from "./stateSchemas.ts";

/** Армия обороняющегося в идущем бою; `null` — такого боя быть не может. */
export function defenderArmy(
  battle: Pick<MapBattle, "heroId" | "guardId" | "defenderHeroId" | "townId">,
  heroes: readonly HeroState[],
  objects: readonly ObjectState[],
): readonly ArmyStack[] | null {
  const guard = objects.find((object) => object.id === battle.guardId);
  if (guard?.type === "guard") {
    return [{ creature: guard.creature, count: guard.count }];
  }
  const attacker = heroes.find((candidate) => candidate.id === battle.heroId);
  const hero = heroes.find((candidate) => candidate.id === battle.defenderHeroId);
  if (hero !== undefined) {
    return hero.owner === attacker?.owner ? null : hero.army;
  }
  const town = objects.find((object) => object.id === battle.townId);
  return town?.type === "town" && town.owner !== attacker?.owner ? town.garrison : null;
}

interface Fate {
  readonly eliminated: boolean;
  readonly townlessDays: number | null;
}

/**
 * Выбыл ли игрок и идёт ли у него отсчёт — так, чтобы запись не спорила с картой
 * (41-victory.md): у выбывшего нет ни героя, ни города; отсчёт есть только без города.
 */
export function readFate(
  saved: LooseState["players"][number] | undefined,
  id: number,
  heroes: readonly HeroState[],
  objects: readonly ObjectState[],
): Fate {
  const town = objects.some((object) => object.type === "town" && object.owner === id);
  const hero = heroes.some((candidate) => candidate.owner === id);
  const eliminated = saved?.eliminated === true && !town && !hero;
  const townlessDays = town || eliminated ? null : (saved?.townlessDays ?? null);
  return { eliminated, townlessDays };
}

/** Итог партии: победитель — только тот, кто не выбыл, и только на карте для нескольких. */
export function readOutcome(
  loose: LooseState,
  fates: readonly Fate[],
): Pick<GameState, "outcome" | "winner"> {
  if (loose.outcome !== "victory") {
    return { outcome: loose.outcome, winner: DEFAULTS.winner };
  }
  const { winner } = loose;
  const valid = winner !== null && fates.length > 1 && fates[winner]?.eliminated === false;
  return valid ? { outcome: "victory", winner } : { outcome: DEFAULTS.outcome, winner: null };
}
