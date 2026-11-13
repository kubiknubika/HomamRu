/**
 * Партия на экране: состояние игры, выбранный путь и действия игрока.
 * Здесь нет ни Phaser, ни React: и сцена, и интерфейс только подписываются.
 * Правил игры здесь тоже нет — все они в ядре.
 * Спецификации: docs/mechanics/02-hero-movement.md («Как игрок управляет героем»),
 * 24-map-screen.md, 43-opponent-screen.md.
 */
import { applyCommand, computerCommand, townsOf } from "@homamru/core";
import type { Command, GameEvent, GameState, TownState } from "@homamru/core";
import { createBattleSession } from "../battle/battleSession.ts";
import { describeCell } from "./captions.ts";
import { messagesOf, summaryOf } from "./messages.ts";
import type { Listener, Session, SessionSnapshot } from "./sessionTypes.ts";
import { activeHero, battleSideOf, computerToMove, humanOf, sameCell, select } from "./view.ts";

export type { Notice, Session, SessionSnapshot } from "./sessionTypes.ts";

/** Сколько последних строк о ходе противника остаётся в сообщении. */
const OPPONENT_LINES = 6;
/** Страховка: больше команд за один пропуск хода компьютер отдать не может. */
const SKIP_LIMIT = 10_000;

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
    townId: null,
    townList: false,
  };
  /** События команды, закончившей бой: карта узнаёт о них, когда игрок вернулся на неё. */
  let afterBattle: { events: readonly GameEvent[]; before: GameState } | null = null;
  /** Строки сообщения, которые копятся, пока ходит противник. */
  let carried: readonly string[] = [];
  const listeners = new Set<Listener>();
  const closed = { townId: null, townList: false, selection: null, inspected: null } as const;

  function publish(
    changes: Partial<SessionSnapshot>,
    events: readonly GameEvent[] = [],
    before: GameState = snapshot.state,
  ): void {
    snapshot = { ...snapshot, ...changes };
    const lines = messagesOf(events, { before, after: snapshot.state });
    if (lines.length > 0) {
      carried = [...carried, ...lines].slice(-OPPONENT_LINES);
      snapshot = { ...snapshot, notice: { id: (snapshot.notice?.id ?? 0) + 1, lines: carried } };
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

  /** Отправляет команду игрока; после принятой заново считает путь до выбранной клетки. */
  function send(command: Command): void {
    const before = snapshot.state;
    const result = accept(command);
    if (result === null) {
      return;
    }
    // Новое действие игрока — новое сообщение: строки прошлого хода противника не тянутся.
    carried = [];
    const target = snapshot.selection?.target;
    // Начался бой — показанный путь больше не нужен.
    const selection =
      target === undefined || result.state.battle !== null ? null : select(result.state, target);
    publish({ state: result.state, selection, inspected: null }, result.events, before);
  }

  /** Команда боя, уже принятая экраном боя: партия обязана принять её так же. */
  function sendBattle(command: Command): void {
    const before = snapshot.state;
    const result = accept(command);
    if (result === null) {
      throw new Error(`Партия отклонила команду боя ${command.type}, принятую экраном боя.`);
    }
    const summary = summaryOf(result.events, before);
    if (summary !== null) {
      afterBattle = { events: result.events.filter((event) => event.type !== "battle"), before };
    }
    // Карта этих событий не видит: она закрыта экраном боя.
    snapshot = { ...snapshot, state: result.state, summary };
    publish({});
  }

  function openBattle(): void {
    const side = battleSideOf(snapshot.state);
    const battle = snapshot.state.battle;
    if (battle !== null && side !== null && snapshot.battle === null) {
      const screen = createBattleSession(battle.state, sendBattle, side);
      publish({ ...closed, battle: screen, summary: null });
    }
  }

  /** На карте может действовать игрок: его ход, нет ни боя, ни конца партии. */
  function mapOpen(): boolean {
    const { state, battle } = snapshot;
    const mine = state.currentPlayer === humanOf(state);
    return mine && state.battle === null && battle === null && state.outcome === null;
  }

  function myTowns(): TownState[] {
    return townsOf(snapshot.state, humanOf(snapshot.state));
  }

  /** Команда городу игрока, чей экран открыт. Отклонённая ничего не меняет. */
  function sendTown(make: (base: { player: number; townId: string }) => Command): void {
    // Экран города закрыт — команда идёт первому городу игрока.
    const townId = snapshot.townId ?? myTowns()[0]?.id;
    if (townId !== undefined && mapOpen()) {
      send(make({ player: humanOf(snapshot.state), townId }));
    }
  }

  /** Герой игрока стоит на своём городе — открывается экран этого города. */
  function openTownUnderHero(): void {
    const hero = activeHero(snapshot.state);
    const town = myTowns().find((candidate) => hero !== undefined && sameCell(hero, candidate));
    if (town !== undefined && mapOpen()) {
      publish({ ...closed, townId: town.id });
    }
  }

  /**
   * Одно действие компьютера без показа: команда и, если начался бой не с игроком, весь этот бой.
   * Возвращает события; `null` — действовать нечем (не его ход, конец партии, бой игрока).
   */
  function computerAct(): GameEvent[] | null {
    const events: GameEvent[] = [];
    do {
      const { state } = snapshot;
      const blocked = !computerToMove(state) || battleSideOf(state) !== null;
      const command = blocked ? undefined : computerCommand(state);
      const result = command === undefined ? null : accept(command);
      if (result === null) {
        return events.length > 0 ? events : null;
      }
      snapshot = { ...snapshot, state: result.state };
      events.push(...result.events.filter((event) => event.type !== "battle"));
    } while (snapshot.state.battle !== null);
    return events;
  }

  // Сохранение сделано посреди боя игрока — сразу экран боя.
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
        send({ type: "moveHero", player: hero.owner, heroId: hero.id, path });
      }
    },
    inspectCell: (cell) => {
      const { state, battle } = snapshot;
      const idle = state.battle === null && battle === null && state.outcome === null;
      if (idle && describeCell(state, cell) !== null) {
        publish({ inspected: cell });
      }
    },
    endTurn: () => {
      if (mapOpen()) {
        send({ type: "endTurn", player: snapshot.state.currentPlayer });
      }
    },
    enterBattle: openBattle,
    heroArrived: openTownUnderHero,
    openTown: () => {
      const towns = myTowns();
      if (towns.length > 0 && mapOpen()) {
        publish(
          towns.length === 1
            ? { townId: towns[0]?.id ?? null, inspected: null }
            : { townList: true, inspected: null },
        );
      }
    },
    chooseTown: (townId) => {
      if (myTowns().some((town) => town.id === townId) && mapOpen()) {
        publish({ townId, townList: false });
      }
    },
    closeTown: () => {
      publish({ townId: null, townList: false });
    },
    build: (building) => {
      sendTown((base) => ({ type: "build", ...base, building }));
    },
    recruit: (creature, count) => {
      sendTown((base) => ({ type: "recruit", ...base, creature, count }));
    },
    transfer: (from, creature, count) => {
      sendTown((base) => ({ type: "transfer", ...base, from, creature, count }));
    },
    hireHero: (offer) => {
      sendTown((base) => ({ type: "hireHero", ...base, offer }));
    },
    leaveBattle: () => {
      if (snapshot.battle !== null && snapshot.state.battle === null) {
        const after = afterBattle;
        afterBattle = null;
        if (!computerToMove(snapshot.state)) {
          carried = [];
        }
        publish({ battle: null }, after?.events ?? [], after?.before);
        // Город взят с боем — экран города открывается сразу.
        openTownUnderHero();
      }
    },
    opponentStep: () => {
      const before = snapshot.state;
      const events = snapshot.battle === null ? computerAct() : null;
      if (events !== null) {
        publish(closed, events, before);
      }
    },
    skipOpponent: () => {
      const before = snapshot.state;
      const all: GameEvent[] = [];
      for (let count = 0; count < SKIP_LIMIT && snapshot.battle === null; count += 1) {
        const events = computerAct();
        if (events === null) {
          break;
        }
        all.push(...events);
      }
      // Шаги героя не показываются: он сразу там, куда шёл.
      publish(
        closed,
        all.filter((event) => event.type !== "heroStepped"),
        before,
      );
    },
  };
}
