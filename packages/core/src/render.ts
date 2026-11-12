/**
 * Текстовый вывод состояния и событий. Это запрос: он ничего не меняет.
 * Спецификация: docs/mechanics/05-diagnostics.md.
 */
import { DAILY_MOVEMENT, heroIdOf } from "./game.ts";
import { renderBattle } from "./battle/render.ts";
import { quantityWord } from "./guards.ts";
import { MINE_INCOME } from "./objects.ts";
import { formatBattleSideEvent } from "./renderEvents.ts";
import { formatTown, formatTownEvent } from "./renderTown.ts";
import { calendarOf } from "./time.ts";
import { RESOURCES } from "./types.ts";
import type {
  ArmyStack,
  GameEvent,
  GameState,
  HeroState,
  ObjectState,
  Position,
  Resources,
} from "./types.ts";

const PATH_SYMBOL = "*";
const MINE_SYMBOL = "M";
const GUARD_SYMBOL = "G";
const TOWN_SYMBOL = "T";
const PILE_SYMBOLS = { gold: "$", wood: "w", ore: "o" } as const;

const RESOURCE_NAMES = { gold: "золото", wood: "дерево", ore: "руда" } as const;
const MINE_NAMES = {
  sawmill: "лесопилка",
  "ore-pit": "рудник",
  "gold-mine": "золотая шахта",
} as const;

function formatResources(resources: Resources): string {
  return RESOURCES.map((resource) => `${RESOURCE_NAMES[resource]} ${resources[resource]}`).join(
    ", ",
  );
}

/** Только то, чего прибыло: «дерево +2, золото +1000». */
function formatIncome(income: Resources): string {
  return RESOURCES.filter((resource) => income[resource] !== 0)
    .map((resource) => `${RESOURCE_NAMES[resource]} +${income[resource]}`)
    .join(", ");
}

function symbolOf(object: ObjectState): string {
  if (object.type === "pile") {
    return PILE_SYMBOLS[object.resource];
  }
  if (object.type === "town") {
    return TOWN_SYMBOL;
  }
  return object.type === "mine" ? MINE_SYMBOL : GUARD_SYMBOL;
}

/** Название существа; если его нет среди существ партии — его идентификатор. */
function creatureName(state: GameState, id: string): string {
  return state.creatures.find((creature) => creature.id === id)?.name ?? id;
}

function formatArmy(state: GameState, army: readonly ArmyStack[]): string {
  return army.map((stack) => `${creatureName(state, stack.creature)} ${stack.count}`).join(", ");
}

function formatHero(state: GameState, hero: HeroState): string {
  return `Герой ${hero.id}: уровень ${hero.level}, опыт ${hero.experience}, атака ${hero.attack}, защита ${hero.defense}; армия: ${formatArmy(state, hero.army)}.`;
}

function formatObject(state: GameState, object: ObjectState): string {
  const place = `${object.id} ${formatCell(object)}`;
  if (object.type === "town") {
    return formatTown(state, object).join("\n");
  }
  if (object.type === "guard") {
    // Разработчику видны и слово, и точное число (21-guards.md).
    return `${place}: охранник, ${creatureName(state, object.creature)}, ${quantityWord(object.count)} (${object.count})`;
  }
  if (object.type === "pile") {
    return `${place}: кучка, ${RESOURCE_NAMES[object.resource]} ${object.amount}`;
  }
  const owner = object.owner === null ? "ничья" : `игрока ${object.owner + 1}`;
  const { resource, amount } = MINE_INCOME[object.kind];
  return `${place}: ${MINE_NAMES[object.kind]}, ${owner}, в день ${RESOURCE_NAMES[resource]} +${amount}`;
}

function formatDate(day: number): string {
  const { month, week, weekday } = calendarOf(day);
  return `месяц ${month}, неделя ${week}, день ${weekday}`;
}

function formatCell(cell: Position): string {
  return `(${cell.x}, ${cell.y})`;
}

/** Печатает состояние символами; клетки пути помечаются звёздочкой. */
export function renderState(state: GameState, path: readonly Position[] = []): string {
  const { map } = state;
  const rows = map.terrain.map((row) => [...row]);
  for (const cell of path) {
    const row = rows[cell.y];
    if (row !== undefined && cell.x >= 0 && cell.x < row.length) {
      row[cell.x] = PATH_SYMBOL;
    }
  }
  for (const object of state.objects) {
    const row = rows[object.y];
    if (row !== undefined) {
      row[object.x] = symbolOf(object);
    }
  }
  for (const hero of state.heroes) {
    const row = rows[hero.y];
    if (row !== undefined) {
      row[hero.x] = heroIdOf(hero.owner);
    }
  }

  const labelWidth = Math.max(2, String(map.height - 1).length);
  const header = Array.from({ length: map.width }, (_, x) => String(x % 10)).join("");
  const lines = [
    `День ${state.day} (${formatDate(state.day)}). Ход игрока ${state.currentPlayer + 1}.`,
    ...state.heroes.map(
      (hero) =>
        `Герой ${hero.id}: клетка ${formatCell(hero)}, запас хода ${hero.movement} из ${DAILY_MOVEMENT}.`,
    ),
    ...state.heroes.map((hero) => formatHero(state, hero)),
    "",
    `${" ".repeat(labelWidth)} ${header}`,
    ...rows.map((row, y) => `${String(y).padStart(labelWidth)} ${row.join("")}`),
    "",
    ...state.objects.filter((object) => object.type !== "town").map((o) => formatObject(state, o)),
    ...state.objects.filter((object) => object.type === "town").map((o) => formatObject(state, o)),
    ...state.players.map(
      (player) => `Игрок ${player.id + 1}: ${formatResources(player.resources)}.`,
    ),
    ...(state.outcome === null ? [] : ["Партия окончена: поражение."]),
    ...(state.battle === null
      ? []
      : [
          "",
          `Идёт бой: герой ${state.battle.heroId} против охранника ${state.battle.guardId}.`,
          renderBattle(state.battle.state),
        ]),
  ];
  return lines.join("\n");
}

/** Печатает событие одной строкой. */
export function formatEvent(event: GameEvent): string {
  switch (event.type) {
    case "heroStepped":
      return `Герой ${event.heroId}: шаг ${formatCell(event.from)} → ${formatCell(event.to)}, потрачено ${event.cost}, осталось ${event.movementLeft}`;
    case "turnEnded":
      return `Игрок ${event.player + 1} закончил ход`;
    case "dayStarted":
      return `Начался день ${event.day} (${formatDate(event.day)})`;
    case "pilePicked":
      return `Игрок ${event.player + 1} подобрал кучку ${event.objectId}: ${RESOURCE_NAMES[event.resource]} +${event.amount}`;
    case "mineCaptured": {
      const from = event.previousOwner === null ? "ничья" : `игрока ${event.previousOwner + 1}`;
      return `Игрок ${event.owner + 1} занял шахту ${event.objectId} (была ${from})`;
    }
    case "incomeReceived":
      return `Игрок ${event.player + 1} получил доход: ${formatIncome(event.income)}`;
    case "buildingBuilt":
    case "creaturesGrew":
    case "creaturesRecruited":
    case "creaturesTransferred":
      return formatTownEvent(event);
    default:
      return formatBattleSideEvent(event);
  }
}
