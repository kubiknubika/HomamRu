/**
 * Заклинания карты: «Городской портал», «Видения», «Маскировка».
 * Спецификация: docs/mechanics/73-map-spells.md.
 */
import { masteryOf } from "./skills.ts";
import { spellAtMastery } from "./spells.ts";
import { townOf } from "./town.ts";
import { reject } from "./types.ts";
import type { SpellDefinition } from "./spells.ts";
import type {
  ArmyStack,
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  Position,
  TownState,
} from "./types.ts";

export interface CastMapCommand {
  readonly type: "castMap";
  readonly player: number;
  readonly heroId: string;
  readonly spell: string;
  /** Для «Городского портала» с выбором города. */
  readonly townId?: string | undefined;
}

const MAP_EFFECTS: ReadonlySet<string> = new Set(["townPortal", "visions", "disguise"]);
/** Наименьшая дальность «Видений», клеток. Число — из Heroes 3. */
const MIN_VISIONS_RANGE = 3;
/** С какого уровня школы город для портала выбирают. */
const CHOICE_MASTERY = 2;

/** Колдуется ли заклинание на карте, а не в бою. */
export function isMapSpell(spell: Pick<SpellDefinition, "effect">): boolean {
  return MAP_EFFECTS.has(spell.effect);
}

/** Заклинания карты из книги героя — уже с его навыками школ: цена и число. */
export function mapSpellsOf(state: GameState, hero: HeroState): SpellDefinition[] {
  if (!hero.book) {
    return [];
  }
  return state.spells
    .filter((spell) => isMapSpell(spell) && hero.spells.includes(spell.id))
    .map((spell) => spellAtMastery(spell, masteryOf(hero, spell)));
}

/** Уровень действия «на день»: без навыка и базовый — 1, продвинутый — 2, экспертный — 3. */
function dayLevel(hero: HeroState, spell: SpellDefinition): number {
  return Math.max(1, masteryOf(hero, spell));
}

function squaredDistance(a: Position, b: Position): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function ownTowns(state: GameState, player: number): TownState[] {
  return state.objects.filter(
    (object): object is TownState => object.type === "town" && object.owner === player,
  );
}

function isFree(state: GameState, town: TownState): boolean {
  return !state.heroes.some((hero) => hero.x === town.x && hero.y === town.y);
}

/**
 * Куда героя перенесёт портал. Без продвинутой земли — только ближайший свой город, и только
 * если в нём нет героя; с ней — любой свой город без героя.
 */
export function portalTowns(state: GameState, hero: HeroState): TownState[] {
  const spell = state.spells.find((candidate) => candidate.effect === "townPortal");
  const towns = ownTowns(state, hero.owner);
  if (spell !== undefined && masteryOf(hero, spell) >= CHOICE_MASTERY) {
    return towns.filter((town) => isFree(state, town));
  }
  const [first, ...rest] = towns;
  if (first === undefined) {
    return [];
  }
  // Из равных по расстоянию — первый в списке карты.
  const nearest = rest.reduce(
    (best, town) => (squaredDistance(town, hero) < squaredDistance(best, hero) ? town : best),
    first,
  );
  return isFree(state, nearest) ? [nearest] : [];
}

/** Дальность «Видений» героя: сила магии × число уровня, но не меньше трёх клеток; 0 — не действуют. */
function visionsRange(state: GameState, hero: HeroState): number {
  if (hero.visions === 0) {
    return 0;
  }
  const spell = state.spells.find((candidate) => candidate.effect === "visions");
  const factor = spell === undefined ? hero.visions : (spell.values[hero.visions - 1] ?? 1);
  return visionsReach(hero.spellPower, factor);
}

/** Дальность «Видений» по силе магии и числу заклинания: произведение, но не меньше трёх клеток. */
export function visionsReach(spellPower: number, factor: number): number {
  return Math.max(MIN_VISIONS_RANGE, spellPower * factor);
}

/**
 * Уровень «Видений» игрока в клетке: лучший из его героев, до которых отсюда по прямой
 * не дальше дальности. 0 — не видно; 1 — охранники; 2 — и чужие герои; 3 — и чужие города.
 */
export function visionsAt(state: GameState, player: number, cell: Position): number {
  return Math.max(
    0,
    ...state.heroes
      .filter(
        (hero) =>
          hero.owner === player &&
          hero.visions > 0 &&
          squaredDistance(hero, cell) <= visionsRange(state, hero) ** 2,
      )
      .map((hero) => hero.visions),
  );
}

/** Отряд, каким его видит противник: `count` `null` — вместо численности «0». */
export interface ShownStack {
  readonly creature: string;
  readonly count: number | null;
}

/** Самое сильное существо: высший уровень; из равных — первое по порядку. */
function strongest(state: GameState, ids: readonly string[]): string | undefined {
  const level = (id: string): number =>
    state.creatures.find((creature) => creature.id === id)?.level ?? 0;
  const [first, ...rest] = ids;
  return rest.reduce(
    (best, id) => (best !== undefined && level(id) > level(best) ? id : best),
    first,
  );
}

/**
 * Армия героя, какой её видит противник-человек (и его «Видения»). Без «Маскировки» — настоящая.
 * Уровень 1 — все отряды как сильнейшее существо армии; 2 — ещё и без численности;
 * 3 — как сильнейшее существо города, без численности.
 */
export function shownArmy(state: GameState, hero: HeroState): ShownStack[] {
  if (hero.disguise === 0) {
    return hero.army.map(({ creature, count }) => ({ creature, count }));
  }
  const own = hero.army.map((stack) => stack.creature);
  const EXPERT = 3;
  // Экспертная «Маскировка» надевает лицо сильнейшего существа города героя —
  // и только своего замка: жилища чужого замка в его городе не строят (74-second-castle.md).
  const town = townOf(state, hero.owner);
  const pool = hero.disguise >= EXPERT ? townCreatures(state, town?.faction ?? "castle") : own;
  const face = strongest(state, pool) ?? strongest(state, own);
  return hero.army.map((stack: ArmyStack) => ({
    creature: face ?? stack.creature,
    count: hero.disguise >= 2 ? null : stack.count,
  }));
}

/** Существа, которых нанимают в городе этого замка: по жилищам своего замка. */
function townCreatures(state: GameState, faction: string): string[] {
  return state.buildings.flatMap((building) =>
    building.dwelling !== undefined && (building.faction ?? "castle") === faction
      ? [building.dwelling]
      : [],
  );
}

/** Почему заклинание сейчас не наколдовать; `null` — можно. Мана и книга не проверяются. */
function obstacle(
  state: GameState,
  hero: HeroState,
  spell: SpellDefinition,
  townId: string | undefined,
): CommandResult | TownState | null {
  if (spell.effect === "townPortal") {
    if (ownTowns(state, hero.owner).length === 0) {
      return reject("NO_TOWN", "У игрока нет города.");
    }
    if (hero.movement < spell.value) {
      return reject(
        "NOT_ENOUGH_MOVEMENT",
        `Нужно ${spell.value} очков хода, а осталось ${hero.movement}.`,
      );
    }
    const towns = portalTowns(state, hero);
    const town = townId === undefined ? towns[0] : towns.find((item) => item.id === townId);
    if (townId === undefined && towns.length > 1) {
      return reject("NO_TOWN", "Нужно выбрать город.");
    }
    return town ?? reject("TOWN_OCCUPIED", "В городе стоит герой, или портал туда не ведёт.");
  }
  const active = spell.effect === "visions" ? hero.visions : hero.disguise;
  if (active >= dayLevel(hero, spell)) {
    return reject("SPELL_ACTIVE", `«${spell.name}» уже действует.`);
  }
  return null;
}

/** Герой колдует заклинание карты. */
export function applyCastMap(state: GameState, command: CastMapCommand): CommandResult {
  const hero = state.heroes.find((candidate) => candidate.id === command.heroId);
  if (hero === undefined) {
    return reject("UNKNOWN_HERO", `Героя «${command.heroId}» нет.`);
  }
  if (hero.owner !== command.player) {
    return reject("NOT_OWNER", `Герой «${command.heroId}» принадлежит другому игроку.`);
  }
  const spell = mapSpellsOf(state, hero).find((candidate) => candidate.id === command.spell);
  if (spell === undefined) {
    return reject("UNKNOWN_SPELL", `Заклинания карты «${command.spell}» в книге героя нет.`);
  }
  if (hero.mana < spell.cost) {
    return reject("NOT_ENOUGH_MANA", `Нужно ${spell.cost} маны, а есть ${hero.mana}.`);
  }
  const found = obstacle(state, hero, spell, command.townId);
  if (found !== null && "ok" in found) {
    return found;
  }
  const level = dayLevel(hero, spell);
  const base = { ...hero, mana: hero.mana - spell.cost };
  let next: HeroState;
  if (found !== null) {
    next = { ...base, x: found.x, y: found.y, movement: hero.movement - spell.value };
  } else if (spell.effect === "visions") {
    next = { ...base, visions: level };
  } else {
    next = { ...base, disguise: level };
  }
  const events: GameEvent[] = [
    {
      type: "mapSpellCast",
      heroId: hero.id,
      spell: spell.id,
      mana: spell.cost,
      townId: found === null ? null : found.id,
      range: spell.effect === "visions" ? visionsRange(state, next) : null,
    },
  ];
  const heroes = state.heroes.map((candidate) => (candidate.id === hero.id ? next : candidate));
  return { ok: true, state: { ...state, heroes }, events };
}

/** Почему герой не может наколдовать заклинание карты сейчас; `null` — может. Для экрана. */
export function mapSpellProblem(
  state: GameState,
  hero: HeroState,
  spell: SpellDefinition,
): string | null {
  if (hero.mana < spell.cost) {
    return "не хватает маны";
  }
  if (spell.effect !== "townPortal") {
    const found = obstacle(state, hero, spell, undefined);
    return found === null ? null : "уже действует";
  }
  if (ownTowns(state, hero.owner).length === 0) {
    return "нет своего города";
  }
  if (hero.movement < spell.value) {
    return "не хватает запаса хода";
  }
  if (portalTowns(state, hero).length > 0) {
    return null;
  }
  return masteryOf(hero, spell) >= CHOICE_MASTERY
    ? "во всех городах стоят герои"
    : "в ближайшем городе стоит герой";
}
