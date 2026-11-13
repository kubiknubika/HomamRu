/**
 * Короткие сообщения о случившемся на карте и итог боя: слова по событиям ядра.
 * Спецификации: docs/mechanics/24-map-screen.md, 33-town-screen.md, 43-opponent-screen.md.
 */
import type { GameEvent, GameState } from "@homamru/core";
import {
  creatureName,
  heroName,
  incomeText,
  lower,
  MINE_NAMES,
  RESOURCE_NAMES,
  STAT_NAMES,
} from "./captions.ts";
import { humanOf } from "./view.ts";

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
    return event.added > 0
      ? `Прирост: ${lower(creatureName(state, event.creature))} +${event.added}`
      : null;
  }
  if (event.type === "heroHired") {
    return `Нанят герой: ${heroName(state, event.hero)}`;
  }
  return null;
}

const MINE_TAKEN = {
  sawmill: "лесопилку",
  "ore-pit": "рудник",
  "gold-mine": "золотую шахту",
} as const;

/** Состояния до и после команды: по ним видно, чьё событие и что пропало с карты. */
export interface MessageContext {
  readonly before: GameState;
  readonly after: GameState;
}

/** Чьё событие: номер игрока; `null` — ничьё или неважно чьё. */
function playerOf(event: GameEvent, { before, after }: MessageContext): number | null {
  const townOwner = (id: string): number | null => {
    const town = after.objects.find((object) => object.id === id);
    return town?.type === "town" ? town.owner : null;
  };
  const heroOwner = (id: string): number | null =>
    [...after.heroes, ...before.heroes].find((hero) => hero.id === id)?.owner ?? null;
  switch (event.type) {
    case "pilePicked":
    case "incomeReceived":
    case "townlessCountdown":
      return event.player;
    case "mineCaptured":
    case "townCaptured":
      return event.owner;
    case "buildingBuilt":
    case "creaturesRecruited":
    case "creaturesGrew":
    case "heroHired":
      return townOwner(event.townId);
    case "levelGained":
      return heroOwner(event.heroId);
    default:
      return null;
  }
}

/** Что игрок видит о делах противника (43-opponent-screen.md, «Ход противника»). */
function opponentMessage(event: GameEvent, context: MessageContext): string | null {
  const { before, after } = context;
  if (event.type === "mineCaptured") {
    const mine = after.objects.find((object) => object.id === event.objectId);
    return `Противник занял ${mine?.type === "mine" ? MINE_TAKEN[mine.kind] : "шахту"}`;
  }
  if (event.type === "heroHired") {
    return `Противник нанял героя: ${heroName(after, event.hero)}`;
  }
  if (event.type === "townCaptured") {
    return event.previousOwner === humanOf(after) ? "Противник захватил ваш город" : null;
  }
  if (event.type === "townlessCountdown") {
    return `Противник без города: осталось дней — ${event.daysLeft}`;
  }
  if (event.type === "guardDefeated") {
    const guard = before.objects.find((object) => object.id === event.objectId);
    const name = guard?.type === "guard" ? lower(creatureName(before, guard.creature)) : "";
    return `Противник победил охранника: ${name}`;
  }
  return null;
}

function ownMessage(event: GameEvent, state: GameState): string | null {
  switch (event.type) {
    case "pilePicked":
      return `Подобрано: ${RESOURCE_NAMES[event.resource]} ${event.amount}`;
    case "mineCaptured": {
      const mine = state.objects.find((object) => object.id === event.objectId);
      return `${mine?.type === "mine" ? MINE_NAMES[mine.kind] : "Шахта"} занята`;
    }
    case "incomeReceived": {
      const income = incomeText(event.income);
      return income === "" ? null : `Доход: ${income}`;
    }
    case "levelGained":
      return `Новый уровень: ${STAT_NAMES[event.stat]} +1`;
    case "townCaptured":
      return "Город захвачен";
    case "townlessCountdown":
      return `Без города: осталось дней — ${event.daysLeft}`;
    default:
      return townMessage(event, state);
  }
}

/**
 * Короткие сообщения игроку о том, что случилось по команде: о своём — как раньше,
 * о делах противника — только то, что игроку важно.
 */
export function messagesOf(events: readonly GameEvent[], context: MessageContext): string[] {
  const me = humanOf(context.after);
  const messages: string[] = [];
  for (const event of events) {
    const player = playerOf(event, context);
    // Победа над охранником — событие без игрока: чьё оно, видно по тому, чей был бой.
    const mine =
      event.type === "guardDefeated" ? context.before.currentPlayer === me : player === me;
    const line = mine ? ownMessage(event, context.after) : opponentMessage(event, context);
    if (line !== null) {
      messages.push(line);
    }
  }
  return messages;
}

/** Итог боя партии для окна после боя: опыт и уровни. Собирается из событий последней команды. */
export interface BattleSummary {
  readonly experience: number;
  /** Что выросло с каждым новым уровнем, по порядку. */
  readonly levels: readonly string[];
  /** В этом бою погиб или бежал герой противника. */
  readonly enemyHeroDefeated: boolean;
}

/** `before` — состояние до команды, закончившей бой: в нём ещё есть оба героя. */
export function summaryOf(events: readonly GameEvent[], before: GameState): BattleSummary | null {
  if (!events.some((event) => event.type === "battleFinished")) {
    return null;
  }
  const me = humanOf(before);
  const mine = (heroId: string): boolean =>
    before.heroes.find((hero) => hero.id === heroId)?.owner === me;
  let experience = 0;
  let enemyHeroDefeated = false;
  const levels: string[] = [];
  for (const event of events) {
    if (event.type === "experienceGained" && mine(event.heroId)) {
      experience += event.amount;
    } else if (event.type === "levelGained" && mine(event.heroId)) {
      levels.push(`Уровень ${event.level}: ${STAT_NAMES[event.stat]} +1`);
    } else if (event.type === "heroDied" && !mine(event.heroId)) {
      enemyHeroDefeated = true;
    }
  }
  return { experience, levels, enemyHeroDefeated };
}
