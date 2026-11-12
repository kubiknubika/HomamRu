/**
 * Охранники: зона, слово о численности, недельный рост.
 * Спецификация: docs/mechanics/21-guards.md.
 */
import type { GameEvent } from "./events.ts";
import type { GameState, GuardState, ObjectState } from "./types.ts";

/** Наибольшее число существ в охраннике. */
export const GUARD_MAX_COUNT = 4000;

/** Сила охранника — число существ в тысячных долях. */
export const POWER_PER_CREATURE = 1000;

/** Недельный рост в процентах — из Heroes 3. */
const GROWTH_PERCENT = 10;

function isGuard(object: ObjectState): object is GuardState {
  return object.type === "guard";
}

/** Клетка в зоне охранника: соседняя по прямой или по диагонали. Своя клетка в зону не входит. */
export function inZone(guard: GuardState, x: number, y: number): boolean {
  return Math.max(Math.abs(guard.x - x), Math.abs(guard.y - y)) === 1;
}

/** Охранник, в чьей зоне клетка: первый по списку объектов. */
export function guardWatching(state: GameState, x: number, y: number): GuardState | undefined {
  return state.objects.filter(isGuard).find((guard) => inZone(guard, x, y));
}

/** Слова о численности: границы — из Heroes 3, слова — свои. */
const QUANTITY_WORDS: readonly (readonly [number, string])[] = [
  [5, "горстка"],
  [10, "несколько"],
  [20, "группа"],
  [50, "много"],
  [100, "орда"],
  [250, "толпа"],
  [500, "полчище"],
  [1000, "тьма"],
];
const LARGEST_WORD = "легион";

export interface QuantityStep {
  readonly word: string;
  /** Границы словами для игрока: «10–19», «1000+». */
  readonly range: string;
}

/** Все слова о численности от меньшего к большему, каждое со своими границами. */
export const QUANTITY_SCALE: readonly QuantityStep[] = [
  ...QUANTITY_WORDS.map(([limit, word], index) => ({
    word,
    range: `${QUANTITY_WORDS[index - 1]?.[0] ?? 1}–${limit - 1}`,
  })),
  { word: LARGEST_WORD, range: `${QUANTITY_WORDS.at(-1)?.[0] ?? 1}+` },
];

/** Границы слова о численности для данного числа: игрок видит их рядом со словом. */
export function quantityRange(count: number): string {
  const word = quantityWord(count);
  return QUANTITY_SCALE.find((step) => step.word === word)?.range ?? "";
}

/** Слово, которым игроку показана численность охранника. */
export function quantityWord(count: number): string {
  return QUANTITY_WORDS.find(([limit]) => count < limit)?.[1] ?? LARGEST_WORD;
}

/** Охранник через неделю: сила растёт на десятую часть, дробь копится. */
function grown(guard: GuardState): GuardState {
  if (guard.count >= GUARD_MAX_COUNT) {
    return guard;
  }
  const power = Math.floor((guard.power * (100 + GROWTH_PERCENT)) / 100);
  const count = Math.min(Math.floor(power / POWER_PER_CREATURE), GUARD_MAX_COUNT);
  // У отряда, дошедшего до предела, сила тоже останавливается: целая часть силы — всегда число.
  return { ...guard, power: Math.min(power, GUARD_MAX_COUNT * POWER_PER_CREATURE), count };
}

/** Первый день недели: растут все охранники. Событие — только если число изменилось. */
export function growGuards(state: GameState, events: GameEvent[]): GameState {
  const objects = state.objects.map((object) => {
    if (!isGuard(object)) {
      return object;
    }
    const next = grown(object);
    if (next.count !== object.count) {
      events.push({ type: "guardGrew", objectId: object.id, from: object.count, to: next.count });
    }
    return next;
  });
  return { ...state, objects };
}
