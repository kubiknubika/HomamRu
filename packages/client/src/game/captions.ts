/**
 * Надписи экрана карты: подписи объектов, предупреждение о бое, короткие сообщения.
 * Спецификация: docs/mechanics/24-map-screen.md. Правил игры здесь нет — только слова.
 */
import {
  MINE_INCOME,
  objectAt,
  quantityRange,
  quantityWord,
  RESOURCES,
  shownArmy,
  townIncome,
  visionsAt,
} from "@homamru/core";
import type {
  GameState,
  GuardState,
  HeroState,
  ObjectState,
  Position,
  ShownStack,
  Resources,
  TownState,
} from "@homamru/core";
import { humanOf } from "./view.ts";
import type { Fight } from "./view.ts";

export const RESOURCE_NAMES = {
  gold: "золото",
  wood: "дерево",
  ore: "руда",
  mercury: "ртуть",
  sulfur: "сера",
  crystal: "кристаллы",
  gems: "самоцветы",
} as const;
export const MINE_NAMES = {
  sawmill: "Лесопилка",
  "ore-pit": "Рудник",
  "gold-mine": "Золотая шахта",
  "alchemist-lab": "Лаборатория алхимика",
  "sulfur-dune": "Серный карьер",
  "crystal-cavern": "Кристальная пещера",
  "gem-pond": "Самоцветный пруд",
} as const;
export const STAT_NAMES = {
  attack: "атака",
  defense: "защита",
  spellPower: "сила магии",
  knowledge: "знание",
} as const;

/** Название существа для игрока; незнакомое — как записано. */
export function creatureName(state: GameState, creatureId: string): string {
  return state.creatures.find((creature) => creature.id === creatureId)?.name ?? creatureId;
}

/**
 * Названия существ во множественном числе, родительный падеж: «группа ополченцев».
 * В данных существ падежей нет; слова экрана лежат здесь, как названия шахт и ресурсов.
 */
export const CREATURE_MANY: Readonly<Record<string, string>> = {
  militia: "ополченцев",
  slinger: "пращников",
  falcon: "соколов",
  armsman: "латников",
  kentaur: "кентавров",
  huntress: "охотниц",
  eagle: "орлов",
  ent: "древней",
  warden: "хранителей",
  wyvern: "вьюнов",
  cavalier: "всадников",
  champion: "витязей",
  griffin: "грив",
};

/**
 * Те же существа в именительном падеже множественного числа: «ополченцы».
 * Нужны там, где отряд назван подлежащим: «Противник победил охранника: ополченцы».
 */
export const CREATURE_PLURAL: Readonly<Record<string, string>> = {
  militia: "ополченцы",
  slinger: "пращники",
  falcon: "соколы",
  armsman: "латники",
  kentaur: "кентавры",
  huntress: "охотницы",
  eagle: "орлы",
  ent: "древни",
  warden: "хранители",
  wyvern: "вьюны",
  cavalier: "всадники",
  champion: "витязи",
  griffin: "гривы",
};

/**
 * Отряд словами, как в Heroes 3: «группа ополченцев (10–19)». Точного числа игрок не видит,
 * а по одному слову не понять, что больше, — поэтому рядом границы.
 */
function describeStack(state: GameState, stack: ShownStack, exact = false): string {
  const { count, creature } = stack;
  const many = CREATURE_MANY[creature];
  if (count === null) {
    // «Маскировка» с продвинутого уровня: вместо численности — «0» (73-map-spells.md).
    return `0 ${many ?? lower(creatureName(state, creature))}`;
  }
  if (exact) {
    // «Видения»: точное число, слово — рядом.
    const who = many ?? `— ${lower(creatureName(state, creature))}`;
    return `${count} ${who} (${quantityWord(count)})`;
  }
  const who =
    many === undefined
      ? `${lower(creatureName(state, creature))} — ${quantityWord(count)}`
      : `${quantityWord(count)} ${many}`;
  return `${who} (${quantityRange(count)})`;
}

/** Уровень «Видений» игрока за экраном в клетке: 1 — охранники, 2 — и герои, 3 — и города. */
function seen(state: GameState, cell: Position): number {
  return visionsAt(state, humanOf(state), cell);
}
const SEE_HEROES = 2;
const SEE_TOWNS = 3;

function describeGuard(state: GameState, guard: GuardState): string {
  return describeStack(state, guard, seen(state, guard) > 0);
}

function ownerText(state: GameState, owner: number | null): string {
  if (owner === null) {
    return "ничья";
  }
  return owner === humanOf(state) ? "ваша" : "противника";
}

/** Армия словами, без точных чисел: «много ополченцев (20–49), несколько пращников (5–9)». */
function armyWords(state: GameState, army: readonly ShownStack[], exact = false): string {
  return army.map((stack) => describeStack(state, stack, exact)).join(", ");
}

/** Герой противника: армия — какой её показывает «Маскировка»; с «Видениями» — числа и характеристики. */
function describeEnemyHero(state: GameState, hero: HeroState): string {
  const exact = seen(state, hero) >= SEE_HEROES;
  const stats = exact
    ? ` Атака ${hero.attack}, защита ${hero.defense}, сила магии ${hero.spellPower}, знание ${hero.knowledge}.`
    : "";
  const army = armyWords(state, shownArmy(state, hero), exact);
  return `Герой противника: ${heroName(state, hero.kind)}.${stats} Армия: ${army}`;
}

function describeGarrison(state: GameState, town: TownState): string {
  return town.garrison.length === 0
    ? "Гарнизон пуст"
    : `Гарнизон: ${armyWords(state, town.garrison, seen(state, town) >= SEE_TOWNS)}`;
}

/** Подпись объекта по удержанию пальца: что это, чьё, сколько даёт. */
function describeObject(state: GameState, object: ObjectState): string {
  if (object.type === "pile") {
    return `Кучка: ${RESOURCE_NAMES[object.resource]} ${object.amount}`;
  }
  if (object.type === "guard") {
    return `Охранник: ${describeGuard(state, object)}`;
  }
  if (object.type === "town") {
    return object.owner === humanOf(state)
      ? `Город, ваш. В день: золото +${townIncome(state, object)}`
      : `Город противника. ${describeGarrison(state, object)}`;
  }
  const { resource, amount } = MINE_INCOME[object.kind];
  const owner = ownerText(state, object.owner);
  return `${MINE_NAMES[object.kind]}, ${owner}. В день: ${RESOURCE_NAMES[resource]} +${amount}`;
}

/** Подпись клетки по удержанию пальца: объект и герой противника, если они там есть. */
export function describeCell(state: GameState, cell: Position): string | null {
  const me = humanOf(state);
  const object = objectAt(state, cell.x, cell.y);
  const enemy = state.heroes.find(
    (hero) => hero.owner !== me && hero.x === cell.x && hero.y === cell.y,
  );
  const parts = [
    object === undefined ? null : describeObject(state, object),
    enemy === undefined ? null : describeEnemyHero(state, enemy),
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(". ");
}

/** Подпись к пути, который кончается боем или захватом. */
export function fightWarning(state: GameState, fight: Fight): string {
  if (fight.kind === "guard") {
    const guard = describeGuard(state, fight.guard);
    return `${guard.slice(0, 1).toUpperCase()}${guard.slice(1)} — будет бой`;
  }
  if (fight.kind === "capture") {
    return "Город противника, гарнизон пуст — город будет захвачен";
  }
  if (fight.kind === "town") {
    return `Город противника. ${describeGarrison(state, fight.town)} — будет бой`;
  }
  const garrison =
    fight.town === null || fight.town.garrison.length === 0
      ? ""
      : `. ${describeGarrison(state, fight.town)}`;
  return `${describeEnemyHero(state, fight.hero)}${garrison} — будет бой`;
}

/** Только то, чего прибыло: «дерево +2, золото +1000». */
/**
 * Строка о счёте дней без города — одна и та же в полосе наверху и в сообщении
 * (43-opponent-screen.md, «Семь дней без города»).
 */
export function townlessText(daysLeft: number): string {
  return `Без города: осталось дней — ${daysLeft}`;
}

export function incomeText(income: Resources): string {
  return RESOURCES.filter((resource) => income[resource] > 0)
    .map((resource) => `${RESOURCE_NAMES[resource]} +${income[resource]}`)
    .join(", ");
}

export function lower(text: string): string {
  return text.toLowerCase();
}

/** Имя героя из списка героев; незнакомое — как записано. */
export function heroName(state: GameState, kind: string): string {
  return state.heroKinds.find((hero) => hero.id === kind)?.name ?? kind;
}
