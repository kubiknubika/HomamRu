/**
 * Бой на экране: состояние боя, выбор игрока и его действия.
 * Здесь нет ни Phaser, ни React, и нет правил боя — они в ядре.
 * Спецификация управления: docs/mechanics/16-battle-screen.md.
 */
import { beforeOpening, cellNote, isSiegeShot, openingLine } from "./battleSiege.ts";
import {
  activeStackOf,
  applyBattleCommand,
  attackCells,
  canShoot,
  chooseBattleCommand,
  damageRange,
  reachableCells,
} from "@homamru/core";
import type { BattleCommand, BattleEvent, BattleState, Cell, StackState } from "@homamru/core";
import { describeEvents } from "./battleLog.ts";
import { routeOf } from "./battleRoute.ts";

type Side = 0 | 1;

interface DamageRange {
  readonly min: number;
  readonly max: number;
}

/** Что выбрал игрок первым касанием. */
export type BattleSelection =
  | { readonly kind: "move"; readonly cell: Cell }
  | { readonly kind: "shoot"; readonly targetId: string; readonly damage: DamageRange }
  | {
      readonly kind: "attack";
      readonly targetId: string;
      /** Клетки, с которых можно ударить эту цель. */
      readonly cells: readonly Cell[];
      /** Клетка, выбранная для удара; повторное касание её или врага — удар. */
      readonly from: Cell | null;
      readonly damage: DamageRange;
    };

export interface BattleSnapshot {
  readonly state: BattleState;
  readonly selection: BattleSelection | null;
  /** Идёт показ событий или ходит компьютер: действия игрока не принимаются. */
  readonly locked: boolean;
  /** Последняя строка журнала боя. */
  readonly log: string;
  /** Журнал боя: по строке на каждый из последних ходов, старые сверху. */
  readonly history: readonly string[];
  /** Отряд, который игрок рассматривает: видны его характеристики и клетки хода. */
  readonly inspected: string | null;
  /** Что сказано про клетку осады, на которой игрок держит палец: стена, ров, ворота, башня. */
  readonly note: string | null;
  /** Сторона игрока: 0 — он напал, 1 — напали на него. За другую ходит компьютер. */
  readonly playerSide: Side;
}

/** Сколько последних ходов хранит журнал боя. */
export const HISTORY_LENGTH = 20;

/**
 * Слушатель получает новый снимок, события команды, если она была,
 * и клетки, по которым отряд прошёл в этой команде.
 */
type Listener = (
  snapshot: BattleSnapshot,
  events: readonly BattleEvent[],
  route: readonly Cell[],
) => void;

export interface BattleSession {
  getSnapshot(): BattleSnapshot;
  subscribe(listener: Listener): () => void;
  /** Касание клетки: первое выбирает, второе подтверждает. */
  tapCell(cell: Cell): void;
  /** Удержание пальца на клетке: показывает характеристики отряда и клетки его хода. */
  inspectCell(cell: Cell): void;
  wait(): void;
  defend(): void;
  flee(): void;
  /**
   * Экран показал события. Если теперь ход компьютера — он ходит,
   * иначе управление возвращается игроку.
   */
  animationDone(): void;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

function stackAt(state: BattleState, cell: Cell): StackState | undefined {
  return state.stacks.find((stack) => stack.count > 0 && sameCell(stack, cell));
}

/** Отряд игрока, которым он сейчас может управлять. */
export function playerStack(snapshot: BattleSnapshot): StackState | undefined {
  const active = activeStackOf(snapshot.state);
  return snapshot.locked || active?.side !== snapshot.playerSide ? undefined : active;
}

/** Выбор по первому касанию врага. */
function selectEnemy(
  state: BattleState,
  me: StackState,
  enemy: StackState,
): BattleSelection | null {
  if (canShoot(state, me)) {
    const damage = damageRange(state, me, enemy, "shot");
    return { kind: "shoot", targetId: enemy.id, damage };
  }
  const cells = attackCells(state, me, enemy);
  if (cells.length === 0) {
    return null;
  }
  const damage = damageRange(state, me, enemy, "melee");
  // Клетка одна — она сразу выбрана.
  const from = cells.length === 1 ? (cells[0] ?? null) : null;
  return { kind: "attack", targetId: enemy.id, cells, from, damage };
}

/** Враги, которых отряд игрока может сейчас ударить или обстрелять. */
export function attackableTargets(snapshot: BattleSnapshot): StackState[] {
  const me = playerStack(snapshot);
  if (me === undefined) {
    return [];
  }
  const { state } = snapshot;
  const enemies = state.stacks.filter(
    (stack) => stack.count > 0 && stack.side !== snapshot.playerSide,
  );
  return canShoot(state, me)
    ? enemies
    : enemies.filter((enemy) => attackCells(state, me, enemy).length > 0);
}

/**
 * Вызывается с каждой принятой командой боя — и игрока, и компьютера.
 * Бой внутри партии так передаёт команды партии (docs/mechanics/23-map-battle.md).
 */
type OnBattleCommand = (command: BattleCommand) => void;

export function createBattleSession(
  initial: BattleState,
  onCommand?: OnBattleCommand,
  playerSide: Side = 0,
  opening: readonly BattleEvent[] = [],
): BattleSession {
  // Выстрелы до первого хода: сначала поле показано как до них, потом они проигрываются.
  let pending = opening.filter(isSiegeShot);
  let snapshot: BattleSnapshot = {
    state: pending.length > 0 ? beforeOpening(initial, pending) : initial,
    selection: null,
    locked: true,
    log: openingLine(initial),
    history: [],
    inspected: null,
    note: null,
    playerSide,
  };
  const listeners = new Set<Listener>();

  function publish(
    changes: Partial<BattleSnapshot>,
    events: readonly BattleEvent[] = [],
    route: readonly Cell[] = [],
  ): void {
    snapshot = { ...snapshot, ...changes };
    for (const listener of listeners) {
      listener(snapshot, events, route);
    }
  }

  /** Отправляет команду; принятая запирает управление, пока экран показывает события. */
  function send(command: BattleCommand): void {
    const result = applyBattleCommand(snapshot.state, command);
    if (!result.ok) {
      publish({ selection: null });
      return;
    }
    onCommand?.(command);
    const route = routeOf(snapshot.state, command);
    const line = describeEvents(result.events, result.state, playerSide);
    const history = line === "" ? snapshot.history : [...snapshot.history, line];
    publish(
      {
        state: result.state,
        selection: null,
        locked: true,
        inspected: null,
        note: null,
        log: line || snapshot.log,
        history: history.slice(-HISTORY_LENGTH),
      },
      result.events,
      route,
    );
  }

  function tapEnemy(state: BattleState, me: StackState, enemy: StackState): void {
    const { selection } = snapshot;
    if (selection?.kind === "shoot" && selection.targetId === enemy.id) {
      send({ type: "battleShoot", side: playerSide, target: enemy.id });
      return;
    }
    // Клетка удара уже выбрана: касание по врагу подтверждает удар с неё.
    if (
      selection?.kind === "attack" &&
      selection.targetId === enemy.id &&
      selection.from !== null
    ) {
      send({ type: "battleAttack", side: playerSide, target: enemy.id, from: selection.from });
      return;
    }
    publish({ selection: selectEnemy(state, me, enemy) });
  }

  function tapFree(state: BattleState, me: StackState, cell: Cell): void {
    const { selection } = snapshot;
    if (selection?.kind === "attack" && selection.cells.some((from) => sameCell(from, cell))) {
      // Первое касание клетки удара выбирает её, второе — бьёт.
      if (selection.from !== null && sameCell(selection.from, cell)) {
        send({ type: "battleAttack", side: playerSide, target: selection.targetId, from: cell });
      } else {
        publish({ selection: { ...selection, from: cell } });
      }
      return;
    }
    if (selection?.kind === "move" && sameCell(selection.cell, cell)) {
      send({ type: "battleMove", side: playerSide, to: cell });
      return;
    }
    const reachable = [...reachableCells(state, me).values()].some((to) => sameCell(to, cell));
    publish({ selection: reachable ? { kind: "move", cell } : null });
  }

  function simple(type: "battleWait" | "battleDefend" | "battleFlee"): void {
    if (playerStack(snapshot) !== undefined) {
      send({ type, side: playerSide });
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tapCell: (cell) => {
      if (snapshot.inspected !== null || snapshot.note !== null) {
        // Касание убирает показ рассматриваемого отряда или клетки.
        publish({ inspected: null, note: null });
      }
      const me = playerStack(snapshot);
      if (me === undefined) {
        return;
      }
      const { state } = snapshot;
      const target = stackAt(state, cell);
      if (target !== undefined && target.side !== playerSide) {
        tapEnemy(state, me, target);
      } else if (target === undefined || sameCell(target, me)) {
        // Своя клетка годится для удара с места.
        tapFree(state, me, cell);
      } else {
        publish({ selection: null });
      }
    },
    inspectCell: (cell) => {
      const target = stackAt(snapshot.state, cell);
      const note = target === undefined ? cellNote(snapshot.state, cell) : null;
      if (target !== undefined || note !== null) {
        publish({ inspected: target?.id ?? null, note });
      }
    },
    wait: () => {
      simple("battleWait");
    },
    defend: () => {
      simple("battleDefend");
    },
    flee: () => {
      simple("battleFlee");
    },
    animationDone: () => {
      if (pending.length > 0) {
        const shots = pending;
        pending = [];
        publish({ state: initial }, shots);
        return;
      }
      const { state } = snapshot;
      const command =
        activeStackOf(state)?.side === playerSide ? undefined : chooseBattleCommand(state);
      if (command === undefined) {
        // Ход игрока или бой окончен.
        publish({ locked: false });
        return;
      }
      send(command);
    },
  };
}
