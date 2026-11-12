/**
 * Бой на экране: состояние боя, выбор игрока и его действия.
 * Здесь нет ни Phaser, ни React, и нет правил боя — они в ядре.
 * Спецификация управления: docs/mechanics/16-battle-screen.md.
 */
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

/** Игрок — нападающий, компьютер — обороняющийся. */
export const PLAYER_SIDE = 0;

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
      readonly damage: DamageRange;
    };

export interface BattleSnapshot {
  readonly state: BattleState;
  readonly selection: BattleSelection | null;
  /** Идёт показ событий или ходит компьютер: действия игрока не принимаются. */
  readonly locked: boolean;
  /** Последняя строка журнала боя. */
  readonly log: string;
  /** Отряд, характеристики которого открыты. */
  readonly inspected: string | null;
}

/** Слушатель получает новый снимок и события команды, если она была. */
type Listener = (snapshot: BattleSnapshot, events: readonly BattleEvent[]) => void;

export interface BattleSession {
  getSnapshot(): BattleSnapshot;
  subscribe(listener: Listener): () => void;
  /** Касание клетки: первое выбирает, второе подтверждает. */
  tapCell(cell: Cell): void;
  /** Удержание пальца на клетке: открывает характеристики отряда. */
  inspectCell(cell: Cell): void;
  closeInspect(): void;
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
  return snapshot.locked || active?.side !== PLAYER_SIDE ? undefined : active;
}

/** Выбор по первому касанию врага. */
function selectEnemy(
  state: BattleState,
  me: StackState,
  enemy: StackState,
): BattleSelection | null {
  if (canShoot(state, me)) {
    const damage = damageRange(state.sides, me, enemy, "shot");
    return { kind: "shoot", targetId: enemy.id, damage };
  }
  const cells = attackCells(state, me, enemy);
  if (cells.length === 0) {
    return null;
  }
  const damage = damageRange(state.sides, me, enemy, "melee");
  return { kind: "attack", targetId: enemy.id, cells, damage };
}

export function createBattleSession(initial: BattleState): BattleSession {
  let snapshot: BattleSnapshot = {
    state: initial,
    selection: null,
    locked: true,
    log: "",
    inspected: null,
  };
  const listeners = new Set<Listener>();

  function publish(changes: Partial<BattleSnapshot>, events: readonly BattleEvent[] = []): void {
    snapshot = { ...snapshot, ...changes };
    for (const listener of listeners) {
      listener(snapshot, events);
    }
  }

  /** Отправляет команду; принятая запирает управление, пока экран показывает события. */
  function send(command: BattleCommand): void {
    const result = applyBattleCommand(snapshot.state, command);
    if (!result.ok) {
      publish({ selection: null });
      return;
    }
    const log = describeEvents(result.events, result.state) || snapshot.log;
    publish({ state: result.state, selection: null, locked: true, log }, result.events);
  }

  function tapEnemy(state: BattleState, me: StackState, enemy: StackState): void {
    const { selection } = snapshot;
    if (selection?.kind === "shoot" && selection.targetId === enemy.id) {
      send({ type: "battleShoot", side: PLAYER_SIDE, target: enemy.id });
      return;
    }
    // Клетка для удара одна: второе касание по врагу бьёт с неё.
    const sameTarget = selection?.kind === "attack" && selection.targetId === enemy.id;
    const [from, another] = selection?.kind === "attack" ? selection.cells : [];
    if (sameTarget && from !== undefined && another === undefined) {
      send({ type: "battleAttack", side: PLAYER_SIDE, target: enemy.id, from });
      return;
    }
    publish({ selection: selectEnemy(state, me, enemy) });
  }

  function tapFree(state: BattleState, me: StackState, cell: Cell): void {
    const { selection } = snapshot;
    if (selection?.kind === "attack" && selection.cells.some((from) => sameCell(from, cell))) {
      send({ type: "battleAttack", side: PLAYER_SIDE, target: selection.targetId, from: cell });
      return;
    }
    if (selection?.kind === "move" && sameCell(selection.cell, cell)) {
      send({ type: "battleMove", side: PLAYER_SIDE, to: cell });
      return;
    }
    const reachable = [...reachableCells(state, me).values()].some((to) => sameCell(to, cell));
    publish({ selection: reachable ? { kind: "move", cell } : null });
  }

  function simple(type: "battleWait" | "battleDefend" | "battleFlee"): void {
    if (playerStack(snapshot) !== undefined) {
      send({ type, side: PLAYER_SIDE });
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
      const me = playerStack(snapshot);
      if (me === undefined) {
        return;
      }
      const { state } = snapshot;
      const target = stackAt(state, cell);
      if (target !== undefined && target.side !== PLAYER_SIDE) {
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
      if (target !== undefined) {
        publish({ inspected: target.id });
      }
    },
    closeInspect: () => {
      publish({ inspected: null });
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
      const { state } = snapshot;
      const command =
        activeStackOf(state)?.side === PLAYER_SIDE ? undefined : chooseBattleCommand(state);
      if (command === undefined) {
        // Ход игрока или бой окончен.
        publish({ locked: false });
        return;
      }
      send(command);
    },
  };
}
