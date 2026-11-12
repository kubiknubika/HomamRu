/**
 * Надписи экрана карты: подписи объектов, предупреждение о бое, короткие сообщения.
 * Спецификация: docs/mechanics/24-map-screen.md. Правил игры здесь нет — только слова.
 */
import { MINE_INCOME, quantityRange, quantityWord, RESOURCES, townIncome } from "@homamru/core";
import type { GameEvent, GameState, GuardState, ObjectState, Resources } from "@homamru/core";

export const RESOURCE_NAMES = { gold: "золото", wood: "дерево", ore: "руда" } as const;
const MINE_NAMES = {
  sawmill: "Лесопилка",
  "ore-pit": "Рудник",
  "gold-mine": "Золотая шахта",
} as const;
const STAT_NAMES = { attack: "атака", defense: "защита" } as const;

/** Название существа для игрока; незнакомое — как записано. */
export function creatureName(state: GameState, creatureId: string): string {
  return state.creatures.find((creature) => creature.id === creatureId)?.name ?? creatureId;
}

/**
 * Существо, слово о численности и его границы: точного числа до боя игрок не видит,
 * а по одному слову не понять, что больше.
 */
function describeGuard(state: GameState, guard: GuardState): string {
  const { count } = guard;
  return `${creatureName(state, guard.creature)}, ${quantityWord(count)} (${quantityRange(count)})`;
}

function ownerText(state: GameState, owner: number | null): string {
  if (owner === null) {
    return "ничья";
  }
  return owner === state.currentPlayer ? "ваша" : `игрока ${owner + 1}`;
}

/** Подпись объекта по удержанию пальца: что это, чьё, сколько даёт. */
export function describeObject(state: GameState, object: ObjectState): string {
  if (object.type === "pile") {
    return `Кучка: ${RESOURCE_NAMES[object.resource]} ${object.amount}`;
  }
  if (object.type === "guard") {
    return `Охранник: ${describeGuard(state, object)}`;
  }
  if (object.type === "town") {
    const owner = object.owner === state.currentPlayer ? "ваш" : `игрока ${object.owner + 1}`;
    return `Город, ${owner}. В день: золото +${townIncome(state, object)}`;
  }
  const { resource, amount } = MINE_INCOME[object.kind];
  const owner = ownerText(state, object.owner);
  return `${MINE_NAMES[object.kind]}, ${owner}. В день: ${RESOURCE_NAMES[resource]} +${amount}`;
}

/** Подпись к пути, который заканчивается боем. */
export function fightWarning(state: GameState, guard: GuardState): string {
  return `${describeGuard(state, guard)} — будет бой`;
}

/** Только то, чего прибыло: «дерево +2, золото +1000». */
function incomeText(income: Resources): string {
  return RESOURCES.filter((resource) => income[resource] > 0)
    .map((resource) => `${RESOURCE_NAMES[resource]} +${income[resource]}`)
    .join(", ");
}

function lower(text: string): string {
  return text.toLowerCase();
}

/** Имя героя из списка героев; незнакомое — как записано. */
export function heroName(state: GameState, kind: string): string {
  return state.heroKinds.find((hero) => hero.id === kind)?.name ?? kind;
}

/** Сообщения города: docs/mechanics/33-town-screen.md, «Сообщения». */
function townMessage(event: GameEvent, state: GameState): string | null {
  if (event.type === "buildingBuilt") {
    const name = state.buildings.find((building) => building.id === event.building)?.name;
    return `Построено: ${lower(name ?? event.building)}`;
  }
  if (event.type === "creaturesRecruited") {
    return `Нанято: ${lower(creatureName(state, event.creature))} ${event.count}`;
  }
  if (event.type === "creaturesGrew") {
    const town = state.objects.find((object) => object.id === event.townId);
    const own = town?.type === "town" && town.owner === state.currentPlayer;
    return own && event.added > 0
      ? `Прирост: ${lower(creatureName(state, event.creature))} +${event.added}`
      : null;
  }
  if (event.type === "heroHired") {
    return `Нанят герой: ${heroName(state, event.hero)}`;
  }
  return null;
}

/**
 * Короткие сообщения игроку о том, что случилось по команде.
 * `state` — состояние после команды: по нему находится занятая шахта.
 */
export function messagesOf(events: readonly GameEvent[], state: GameState): string[] {
  const messages: string[] = [];
  for (const event of events) {
    if (event.type === "pilePicked") {
      messages.push(`Подобрано: ${RESOURCE_NAMES[event.resource]} ${event.amount}`);
    } else if (event.type === "mineCaptured") {
      const mine = state.objects.find((object) => object.id === event.objectId);
      const name = mine?.type === "mine" ? MINE_NAMES[mine.kind] : "Шахта";
      messages.push(`${name} занята`);
    } else if (event.type === "incomeReceived" && event.player === state.currentPlayer) {
      const income = incomeText(event.income);
      if (income !== "") {
        messages.push(`Доход: ${income}`);
      }
    } else if (event.type === "levelGained") {
      messages.push(`Новый уровень: ${STAT_NAMES[event.stat]} +1`);
    } else {
      const line = townMessage(event, state);
      if (line !== null) {
        messages.push(line);
      }
    }
  }
  return messages;
}

/** Итог боя партии для окна после боя: опыт и уровни. Собирается из событий последней команды. */
export interface BattleSummary {
  readonly experience: number;
  /** Что выросло с каждым новым уровнем, по порядку. */
  readonly levels: readonly string[];
}

export function summaryOf(events: readonly GameEvent[]): BattleSummary | null {
  if (!events.some((event) => event.type === "battleFinished")) {
    return null;
  }
  let experience = 0;
  const levels: string[] = [];
  for (const event of events) {
    if (event.type === "experienceGained") {
      experience += event.amount;
    } else if (event.type === "levelGained") {
      levels.push(`Уровень ${event.level}: ${STAT_NAMES[event.stat]} +1`);
    }
  }
  return { experience, levels };
}
