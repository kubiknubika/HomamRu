/** Партия на экране: что видят сцена и интерфейс и что они могут попросить. */
import type { GameEvent, GameState, Position } from "@homamru/core";
import type { BattleSession } from "../battle/battleSession.ts";
import type { BattleSummary } from "./messages.ts";
import type { Selection } from "./view.ts";

export interface SessionSnapshot {
  readonly state: GameState;
  readonly selection: Selection | null;
  /** Клетка, которую игрок рассматривает (удержание пальца): видна её подпись. */
  readonly inspected: Position | null;
  /** Бой на экране. Остаётся и после конца боя, пока игрок не закрыл окно итога. */
  readonly battle: BattleSession | null;
  /** Итог последнего боя: опыт и уровни. Пусто, пока бой идёт. */
  readonly summary: BattleSummary | null;
  /**
   * Последнее сообщение игроку о случившемся на карте. Хранится здесь, а не в интерфейсе:
   * после боя интерфейс карты появляется позже, чем приходят события.
   */
  readonly notice: Notice | null;
  /** Город игрока, чей экран открыт (33-town-screen.md); `null` — экран закрыт. */
  readonly townId: string | null;
  /** Открыт список своих городов: их больше одного, игрок выбирает. */
  readonly townList: boolean;
}

export interface Notice {
  /** Номер сообщения: по нему интерфейс отличает новое сообщение от прежнего. */
  readonly id: number;
  readonly lines: readonly string[];
}

/** Слушатель получает новый снимок и события команды, если она была. */
export type Listener = (snapshot: SessionSnapshot, events: readonly GameEvent[]) => void;

export interface Session {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: Listener): () => void;
  /** Касание клетки: первое показывает путь, второе по той же клетке отправляет героя. */
  tapCell(cell: Position): void;
  /** Удержание пальца на клетке: подпись того, что там есть. */
  inspectCell(cell: Position): void;
  endTurn(): void;
  /** Карта показала, что герой дошёл: если начался бой игрока, открывается экран боя. */
  enterBattle(): void;
  /** Карта показала, что герой дошёл: если он встал на свой город, открывается экран города. */
  heroArrived(): void;
  /** Кнопка «Город»: один город открывается сразу, из нескольких игрок выбирает. */
  openTown(): void;
  chooseTown(townId: string): void;
  closeTown(): void;
  build(building: string): void;
  recruit(creature: string, count: number): void;
  /** Передать отряд: `from` — кто отдаёт. */
  transfer(from: "garrison" | "hero", creature: string, count: number): void;
  /** Нанять героя таверны с номером 0 или 1. */
  hireHero(offer: number): void;
  /** Игрок закрыл окно итога боя: экран возвращается к карте. */
  leaveBattle(): void;
  /**
   * Одно действие компьютерного игрока: команда карты, а бой с охранником — сразу целиком.
   * Зовёт карта, когда показала предыдущее. Не его ход или идёт бой игрока — ничего не делает.
   */
  opponentStep(): void;
  /** «Пропустить»: ход противника доигрывается сразу — до конца или до нападения на игрока. */
  skipOpponent(): void;
}
