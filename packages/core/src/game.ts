/**
 * Создание партии. Спецификация: docs/mechanics/00-state-and-commands.md.
 */
import { mergeArmy } from "./army.ts";
import { DAILY_MOVEMENT, heroIdOf } from "./heroIds.ts";
import { maxMana, withGuildSpells } from "./magic.ts";
import { validateMap } from "./map.ts";
import type { MapError } from "./map.ts";
import { addResources, createObjects, NO_RESOURCES } from "./objects.ts";
import { createRng } from "./rng.ts";
import { STATE_VERSION } from "./types.ts";
import { stockTown } from "./town.ts";
import { refreshTavern } from "./tavern.ts";
import type { GameContent, HeroKind } from "./tavernTypes.ts";
import type { GameState, HeroState, MapDefinition } from "./types.ts";

type HeroOnMap = MapDefinition["players"][number]["hero"];

/** Магия героя в начале партии: числа из карты важнее чисел из списка героев; мана полная. */
function magicOf(
  hero: HeroOnMap,
  kind: HeroKind | undefined,
): Pick<
  HeroState,
  "spellPower" | "knowledge" | "mana" | "book" | "spells" | "skills" | "skillOffer" | "skillsOwed"
> {
  const knowledge = hero.knowledge ?? kind?.knowledge ?? 0;
  const skills = [...(hero.skills ?? [])];
  return {
    spellPower: hero.spellPower ?? kind?.spellPower ?? 0,
    knowledge,
    mana: maxMana({ knowledge, skills }),
    book: hero.book ?? false,
    spells: [...(hero.spells ?? [])],
    skills,
    skillOffer: [],
    skillsOwed: 0,
  };
}

export { DAILY_MOVEMENT, heroIdOf } from "./heroIds.ts";

export type CreateGameResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly errors: readonly MapError[] };

/** Создаёт партию из описания карты, сида и контента игры. Неверная карта — список причин. */
export function createGame(
  map: MapDefinition,
  seed: number,
  content: GameContent,
): CreateGameResult {
  const { creatures, buildings } = content;
  const errors = [...validateMap(map, creatures, buildings, content.heroes)];
  for (const [index, player] of map.players.entries()) {
    for (const id of player.hero.spells ?? []) {
      if (!content.spells.some((spell) => spell.id === id)) {
        errors.push({ field: `players.${index}.hero.spells`, message: `Заклинания «${id}» нет.` });
      }
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const { objects, rng } = createObjects(map.objects ?? [], createRng(seed));
  const state: GameState = {
    version: STATE_VERSION,
    rng,
    map: {
      id: map.id,
      name: map.name,
      width: map.terrain[0]?.length ?? 0,
      height: map.terrain.length,
      terrain: [...map.terrain],
      starts: map.players.map((player) => ({ x: player.hero.x, y: player.hero.y })),
    },
    players: map.players.map((player, id) => ({
      id,
      kind: player.kind ?? "human",
      eliminated: false,
      townlessDays: null,
      resources: addResources(NO_RESOURCES, player.resources ?? {}),
      tavern: [],
    })),
    heroes: map.players.map((player, owner) => {
      // Героя называет карта; имени нет — первый из списка (32-hero-hire.md).
      const kind =
        content.heroes.find((candidate) => candidate.id === player.hero.name) ?? content.heroes[0];
      return {
        id: heroIdOf(owner),
        owner,
        kind: kind?.id ?? "",
        name: kind?.name ?? "",
        x: player.hero.x,
        y: player.hero.y,
        movement: DAILY_MOVEMENT,
        // Числа из карты важнее чисел из списка героев.
        attack: player.hero.attack ?? kind?.attack ?? 0,
        defense: player.hero.defense ?? kind?.defense ?? 0,
        ...magicOf(player.hero, kind),
        // Один отряд на вид существ: одинаковые сливаются (31-recruitment.md).
        army: mergeArmy(player.hero.army),
        experience: 0,
        level: 1,
      };
    }),
    objects,
    day: 1,
    currentPlayer: 0,
    creatures: creatures.map((creature) => ({ ...creature })),
    buildings: buildings.map((building) => ({ ...building })),
    heroKinds: content.heroes.map((kind) => ({ ...kind })),
    spells: content.spells.map((spell) => ({ ...spell })),
    tavern: { price: content.tavern.price, army: content.tavern.army.map((rule) => ({ ...rule })) },
    opponent: {
      advantagePercent: content.opponent.advantagePercent,
      buildOrder: [...content.opponent.buildOrder],
    },
    battle: null,
    outcome: null,
    winner: null,
  };
  // В жилищах, построенных с начала, уже ждёт недельный прирост.
  const stocked = state.objects.map((object) =>
    object.type === "town" ? stockTown(state, object) : object,
  );
  // Герои таверны выбираются в начале партии — у игроков с городом.
  let ready: GameState = { ...state, objects: stocked };
  for (const player of ready.players) {
    ready = refreshTavern(ready, player.id, []);
  }
  // Набор каждой гильдии магов решается в начале партии, после таверн (61-magic.md).
  return { ok: true, state: withGuildSpells(ready) };
}
