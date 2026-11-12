/**
 * Партия на экране: состояние игры, выбранный путь и действия игрока.
 * Здесь нет ни Phaser, ни React: и сцена, и интерфейс только подписываются.
 * Правил игры здесь тоже нет — все они в ядре.
 * Спецификации: docs/mechanics/02-hero-movement.md («Как игрок управляет героем»),
 * 24-map-screen.md.
 */
import { applyCommand, cellsAlong, findPath, guardWatching, objectAt } from "@homamru/core";
import type {
  Command,
  GameEvent,
  GameState,
  GuardState,
  HeroState,
  ObjectState,
  PathResult,
  Position,
} from "@homamru/core";
import { createBattleSession } from "../battle/battleSession.ts";
import type { BattleSession } from "../battle/battleSession.ts";
import { messagesOf, summaryOf } from "./captions.ts";
import type { BattleSummary } from "./captions.ts";

/** Клетка, которую выбрал игрок, и путь до неё. */
export interface Selection {
  readonly target: Position;
  readonly path: PathResult;
  /** Охранник, с которым будет бой, если герой пройдёт этот путь до конца. */
  readonly guard: GuardState | null;
}

export interface SessionSnapshot {
  readonly state: GameState;
  readonly selection: Selection | null;
  /** Объект, который игрок рассматривает (удержание пальца): видна его подпись. */
  readonly inspected: ObjectState | null;
  /** Бой на экране. Остаётся и после конца боя, пока игрок не закрыл окно итога. */
  readonly battle: BattleSession | null;
  /** Итог последнего боя: опыт и уровни. Пусто, пока бой идёт. */
  readonly summary: BattleSummary | null;
  /**
   * Последнее сообщение игроку о случившемся на карте. Хранится здесь, а не в интерфейсе:
   * после боя интерфейс карты появляется позже, чем приходят события.
   */
  readonly notice: Notice | null;
}

export interface Notice {
  /** Номер сообщения: по нему интерфейс отличает новое сообщение от прежнего. */
  readonly id: number;
  readonly lines: readonly string[];
}

/** Слушатель получает новый снимок и события команды, если она была. */
type Listener = (snapshot: SessionSnapshot, events: readonly GameEvent[]) => void;

export interface Session {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: Listener): () => void;
  /** Касание клетки: первое показывает путь, второе по той же клетке отправляет героя. */
  tapCell(cell: Position): void;
  /** Удержание пальца на клетке: подпись объекта, если он там есть. */
  inspectCell(cell: Position): void;
  endTurn(): void;
  /** Карта показала, что герой дошёл: если начался бой, открывается экран боя. */
  enterBattle(): void;
  /** Игрок закрыл окно итога боя: экран возвращается к карте. */
  leaveBattle(): void;
}

/** Герой игрока, чей сейчас ход. */
export function activeHero(state: GameState): HeroState | undefined {
  return state.heroes.find((hero) => hero.owner === state.currentPlayer);
}

function sameCell(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Охранник, с которым герой сразится в конце пути: цель — он сам или клетка его зоны. */
function guardAhead(
  state: GameState,
  hero: HeroState,
  target: Position,
  path: PathResult,
): GuardState | null {
  if (!path.found) {
    return null;
  }
  const aimed = objectAt(state, target.x, target.y);
  if (aimed?.type === "guard") {
    return aimed;
  }
  const end = cellsAlong(hero, path.steps).at(-1);
  return end === undefined ? null : (guardWatching(state, end.x, end.y) ?? null);
}

function select(state: GameState, target: Position): Selection | null {
  const hero = activeHero(state);
  if (hero === undefined || sameCell(hero, target)) {
    return null;
  }
  const path = findPath(state, hero.id, target);
  return { target, path, guard: guardAhead(state, hero, target, path) };
}

/** Вызывается после каждой принятой команды: по нему партия сохраняется. */
type OnAccepted = (command: Command, state: GameState) => void;

export function createSession(initial: GameState, onAccepted?: OnAccepted): Session {
  let snapshot: SessionSnapshot = {
    state: initial,
    selection: null,
    inspected: null,
    battle: null,
    summary: null,
    notice: null,
  };
  /** События команды, закончившей бой: карта узнаёт о них, когда игрок вернулся на неё. */
  let afterBattle: readonly GameEvent[] = [];
  const listeners = new Set<Listener>();

  function publish(changes: Partial<SessionSnapshot>, events: readonly GameEvent[] = []): void {
    snapshot = { ...snapshot, ...changes };
    const lines = messagesOf(events, snapshot.state);
    if (lines.length > 0) {
      snapshot = { ...snapshot, notice: { id: (snapshot.notice?.id ?? 0) + 1, lines } };
    }
    for (const listener of listeners) {
      listener(snapshot, events);
    }
  }

  /** Применяет команду; `null` — команда отклонена. */
  function accept(command: Command): { state: GameState; events: readonly GameEvent[] } | null {
    const result = applyCommand(snapshot.state, command);
    if (!result.ok) {
      return null;
    }
    onAccepted?.(command, result.state);
    return result;
  }

  /** Отправляет команду карты; после принятой заново считает путь до выбранной клетки. */
  function send(command: Command): void {
    const result = accept(command);
    if (result === null) {
      return;
    }
    const target = snapshot.selection?.target;
    // Начался бой — показанный путь больше не нужен.
    const selection =
      target === undefined || result.state.battle !== null ? null : select(result.state, target);
    publish({ state: result.state, selection, inspected: null }, result.events);
  }

  /** Команда боя, уже принятая экраном боя: партия обязана принять её так же. */
  function sendBattle(command: Command): void {
    const result = accept(command);
    if (result === null) {
      throw new Error(`Партия отклонила команду боя ${command.type}, принятую экраном боя.`);
    }
    const summary = summaryOf(result.events);
    if (summary !== null) {
      afterBattle = result.events.filter((event) => event.type !== "battle");
    }
    // Карта этих событий не видит: она закрыта экраном боя.
    publish({ state: result.state, summary });
  }

  function openBattle(): void {
    const battle = snapshot.state.battle;
    if (battle !== null && snapshot.battle === null) {
      const screen = createBattleSession(battle.state, sendBattle);
      publish({ battle: screen, selection: null, inspected: null, summary: null });
    }
  }

  /** На карте можно действовать: нет ни боя, ни конца партии. */
  function mapOpen(): boolean {
    const { state, battle } = snapshot;
    return state.battle === null && battle === null && state.outcome === null;
  }

  // Сохранение сделано посреди боя — сразу экран боя.
  openBattle();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tapCell: (cell) => {
      const { state, selection } = snapshot;
      const hero = activeHero(state);
      const { width, height } = state.map;
      const outside = cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height;
      if (hero === undefined || outside || !mapOpen()) {
        return;
      }
      if (selection === null || !sameCell(selection.target, cell)) {
        publish({ selection: select(state, cell), inspected: null });
        return;
      }
      // Второе касание той же клетки: герой идёт, на сколько хватает очков.
      if (selection.path.found && selection.path.stepsToday > 0) {
        const path = selection.path.steps.slice(0, selection.path.stepsToday);
        send({ type: "moveHero", player: state.currentPlayer, heroId: hero.id, path });
      }
    },
    inspectCell: (cell) => {
      const object = objectAt(snapshot.state, cell.x, cell.y);
      if (mapOpen() && object !== undefined) {
        publish({ inspected: object });
      }
    },
    endTurn: () => {
      if (mapOpen()) {
        send({ type: "endTurn", player: snapshot.state.currentPlayer });
      }
    },
    enterBattle: openBattle,
    leaveBattle: () => {
      if (snapshot.battle !== null && snapshot.state.battle === null) {
        const events = afterBattle;
        afterBattle = [];
        publish({ battle: null }, events);
      }
    },
  };
}
