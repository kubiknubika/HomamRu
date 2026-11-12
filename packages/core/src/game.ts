/**
 * Создание партии. Спецификация: docs/mechanics/00-state-and-commands.md.
 */
import { validateMap } from "./map.ts";
import type { MapError } from "./map.ts";
import { addResources, createObjects, NO_RESOURCES } from "./objects.ts";
import { createRng } from "./rng.ts";
import { STATE_VERSION } from "./types.ts";
import type { GameState, MapDefinition } from "./types.ts";

/** Запас хода героя на день. */
export const DAILY_MOVEMENT = 1000;

const HERO_IDS = ["A", "B"] as const;

export type CreateGameResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly errors: readonly MapError[] };

/** Идентификатор героя игрока: `A` у первого, `B` у второго. */
export function heroIdOf(player: number): string {
  return HERO_IDS[player] ?? `H${player}`;
}

/** Создаёт партию из описания карты и сида. Неверная карта — список причин. */
export function createGame(map: MapDefinition, seed: number): CreateGameResult {
  const errors = validateMap(map);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const { objects, rng } = createObjects(map.objects ?? [], createRng(seed));
  return {
    ok: true,
    state: {
      version: STATE_VERSION,
      rng,
      map: {
        id: map.id,
        name: map.name,
        width: map.terrain[0]?.length ?? 0,
        height: map.terrain.length,
        terrain: [...map.terrain],
      },
      players: map.players.map((player, id) => ({
        id,
        resources: addResources(NO_RESOURCES, player.resources ?? {}),
      })),
      heroes: map.players.map((player, owner) => ({
        id: heroIdOf(owner),
        owner,
        x: player.hero.x,
        y: player.hero.y,
        movement: DAILY_MOVEMENT,
      })),
      objects,
      day: 1,
      currentPlayer: 0,
    },
  };
}
