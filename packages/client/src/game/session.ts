/**
 * Партия на экране: состояние игры, выбранный путь и действия игрока.
 * Здесь нет ни Phaser, ни React: и сцена, и интерфейс только подписываются.
 * Правил игры здесь тоже нет — все они в ядре.
 * Спецификация управления: docs/mechanics/02-hero-movement.md,
 * раздел «Как игрок управляет героем».
 */
import { applyCommand, findPath } from "@homamru/core";
import type { Command, GameEvent, GameState, HeroState, PathResult, Position } from "@homamru/core";

/** Клетка, которую выбрал игрок, и путь до неё. */
export interface Selection {
  readonly target: Position;
  readonly path: PathResult;
}

export interface SessionSnapshot {
  readonly state: GameState;
  readonly selection: Selection | null;
}

/** Слушатель получает новый снимок и события команды, если она была. */
type Listener = (snapshot: SessionSnapshot, events: readonly GameEvent[]) => void;

export interface Session {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: Listener): () => void;
  /** Касание клетки: первое показывает путь, второе по той же клетке отправляет героя. */
  tapCell(cell: Position): void;
  endTurn(): void;
}

/** Герой игрока, чей сейчас ход. */
export function activeHero(state: GameState): HeroState | undefined {
  return state.heroes.find((hero) => hero.owner === state.currentPlayer);
}

function sameCell(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function select(state: GameState, target: Position): Selection | null {
  const hero = activeHero(state);
  if (hero === undefined || sameCell(hero, target)) {
    return null;
  }
  return { target, path: findPath(state, hero.id, target) };
}

export function createSession(initial: GameState): Session {
  let snapshot: SessionSnapshot = { state: initial, selection: null };
  const listeners = new Set<Listener>();

  function publish(next: SessionSnapshot, events: readonly GameEvent[] = []): void {
    snapshot = next;
    for (const listener of listeners) {
      listener(snapshot, events);
    }
  }

  /** Отправляет команду; после принятой заново считает путь до выбранной клетки. */
  function send(command: Command): void {
    const result = applyCommand(snapshot.state, command);
    if (!result.ok) {
      return;
    }
    const target = snapshot.selection?.target;
    const selection = target === undefined ? null : select(result.state, target);
    publish({ state: result.state, selection }, result.events);
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
      const { state, selection } = snapshot;
      const hero = activeHero(state);
      const { width, height } = state.map;
      if (hero === undefined || cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) {
        return;
      }
      if (selection === null || !sameCell(selection.target, cell)) {
        publish({ state, selection: select(state, cell) });
        return;
      }
      // Второе касание той же клетки: герой идёт, на сколько хватает очков.
      if (selection.path.found && selection.path.stepsToday > 0) {
        const path = selection.path.steps.slice(0, selection.path.stepsToday);
        send({ type: "moveHero", player: state.currentPlayer, heroId: hero.id, path });
      }
    },
    endTurn: () => {
      send({ type: "endTurn", player: snapshot.state.currentPlayer });
    },
  };
}
