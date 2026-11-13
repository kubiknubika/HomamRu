/**
 * Сцена боя. Только показывает состояние и передаёт касания в бой;
 * правил боя здесь нет (догма 5). Спецификация: docs/mechanics/16-battle-screen.md.
 */
import { BATTLE_HEIGHT, BATTLE_WIDTH } from "@homamru/core";
import type { BattleEvent, BattleState, Cell } from "@homamru/core";
import * as Phaser from "phaser";
import type { FrameMeter } from "../game/frameMeter.ts";
import { showLabel, showStrike, tracePath } from "./battleEffects.ts";
import { highlightsOf } from "./battleHighlights.ts";
import { cellAt, cellCenter, cellCorners, layoutOf } from "./battleGeometry.ts";
import type { BattleLayout } from "./battleGeometry.ts";
import type { BattleSession, BattleSnapshot } from "./battleSession.ts";
import {
  CELL_MARK_STYLES,
  createStackStub,
  fieldColors,
  FIELD_LINE_COLOR,
  RING_MARK_STYLES,
} from "./battleStubs.ts";
import type { StackStub } from "./battleStubs.ts";

/** Место снизу под журнал, очередь ходов и кнопки (см. styles.css). */
const BOTTOM_HEIGHT = 72;
const MARGIN = 6;

const MOVE_MS = 260;
/** Один шаг пешего отряда по пути. */
const STEP_MS = 110;
/** Пауза после показа событий, чтобы игрок успел увидеть, что произошло. */
const PAUSE_MS = 220;
const HOLD_MS = 500;
/** Сдвиг пальца, после которого касание уже не считается ни нажатием, ни удержанием. */
const HOLD_SLOP = 12;

const HIGHLIGHT_DEPTH = 1;
const STACK_DEPTH = 2;

export class BattleScene extends Phaser.Scene {
  private readonly session: BattleSession;
  private readonly frameMeter: FrameMeter;
  private readonly stubs = new Map<string, StackStub>();
  private layout: BattleLayout = layoutOf({ x: 0, y: 0, width: 1, height: 1 });
  private field: Phaser.GameObjects.Graphics | undefined;
  private highlights: Phaser.GameObjects.Graphics | undefined;
  /** События, которые ещё предстоит показать. */
  private pending: BattleEvent[] = [];
  private showing = false;
  /** Клетки пути отряда в показываемой команде. */
  private route: Cell[] = [];
  private hold: Phaser.Time.TimerEvent | undefined;
  private held = false;

  constructor(session: BattleSession, frameMeter: FrameMeter) {
    super("battle");
    this.session = session;
    this.frameMeter = frameMeter;
  }

  override update(_time: number, delta: number): void {
    this.frameMeter.add(delta);
  }

  create(): void {
    this.field = this.add.graphics();
    this.highlights = this.add.graphics().setDepth(HIGHLIGHT_DEPTH);
    this.rebuild();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    const unsubscribe = this.session.subscribe((snapshot, events, route) => {
      this.onChange(snapshot, events, route);
    });
    const release = (): void => {
      unsubscribe();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild, this);
    };
    // Phaser, который уничтожают целиком, о закрытии сцены не сообщает — только об уничтожении.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, release);
    this.events.once(Phaser.Scenes.Events.DESTROY, release);
    // Поле показано: бой может начинаться.
    this.time.delayedCall(PAUSE_MS, () => {
      this.session.animationDone();
    });
  }

  /** Размер отряда на экране: по меньшей стороне клетки. */
  private stackSize(): number {
    return Math.min(this.layout.cellWidth, this.layout.radius * 1.9);
  }

  /** Пересчитывает размеры под экран и рисует всё заново. */
  private rebuild(): void {
    const { width, height } = this.scale;
    this.layout = layoutOf({
      x: MARGIN,
      y: MARGIN,
      width: Math.max(1, width - MARGIN * 2),
      height: Math.max(1, height - BOTTOM_HEIGHT - MARGIN * 2),
    });
    const { state } = this.session.getSnapshot();
    this.drawField(state);
    for (const stub of this.stubs.values()) {
      stub.container.destroy();
    }
    this.stubs.clear();
    for (const stack of state.stacks) {
      const stub = createStackStub(this, stack, this.stackSize());
      stub.container.setDepth(STACK_DEPTH);
      this.stubs.set(stack.id, stub);
    }
    this.placeStacks(state);
    this.drawHighlights(this.session.getSnapshot());
  }

  private drawField(state: BattleState): void {
    const graphics = this.field;
    if (graphics === undefined) {
      return;
    }
    graphics.clear();
    const colorOf = fieldColors(state);
    graphics.lineStyle(1.5, FIELD_LINE_COLOR, 0.9);
    for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
      for (let col = 0; col < BATTLE_WIDTH; col += 1) {
        const corners = cellCorners(this.layout, { col, row });
        graphics.fillStyle(colorOf({ col, row }), 1);
        tracePath(graphics, corners);
        graphics.fillPath();
        graphics.strokePath();
      }
    }
  }

  /** Ставит отряды по состоянию: место, число существ; погибшие скрыты. */
  private placeStacks(state: BattleState): void {
    for (const stack of state.stacks) {
      const stub = this.stubs.get(stack.id);
      if (stub === undefined) {
        continue;
      }
      const center = cellCenter(this.layout, stack);
      stub.container
        .setPosition(center.x, center.y)
        .setVisible(stack.count > 0)
        .setAlpha(1);
      stub.count.setText(String(stack.count));
    }
  }

  /** Подсветка: клетки хода, выбор игрока, обводки отрядов (что именно — battleHighlights.ts). */
  private drawHighlights(snapshot: BattleSnapshot): void {
    const graphics = this.highlights;
    if (graphics === undefined) {
      return;
    }
    graphics.clear();
    if (this.showing) {
      return;
    }
    const highlights = highlightsOf(snapshot);
    for (const { cell, mark } of highlights.cells) {
      const style = CELL_MARK_STYLES[mark];
      graphics.fillStyle(style.color, style.alpha);
      tracePath(graphics, cellCorners(this.layout, cell));
      graphics.fillPath();
    }
    const size = this.stackSize();
    for (const { stack, mark } of highlights.rings) {
      const style = RING_MARK_STYLES[mark];
      const center = cellCenter(this.layout, stack);
      graphics.lineStyle(style.width, style.color, 1);
      graphics.strokeCircle(
        center.x,
        center.y - size * 0.1,
        size * (mark === "active" ? 0.42 : 0.5),
      );
    }
  }

  private onChange(
    snapshot: BattleSnapshot,
    events: readonly BattleEvent[],
    route: readonly Cell[],
  ): void {
    if (events.length === 0) {
      if (!this.showing) {
        this.drawHighlights(snapshot);
      }
      return;
    }
    this.pending.push(...events);
    this.route = [...route];
    if (!this.showing) {
      this.showing = true;
      this.highlights?.clear();
      this.showNext();
    }
  }

  /** Отряд идёт по клеткам пути одна за другой. */
  private walk(stub: StackStub, cells: readonly Cell[], onComplete: () => void): void {
    const [first, ...rest] = cells;
    if (first === undefined) {
      onComplete();
      return;
    }
    const to = cellCenter(this.layout, first);
    this.tweens.add({
      targets: stub.container,
      x: to.x,
      y: to.y,
      // Перелёт или один шаг — плавно; длинный путь пешком — быстрее на клетку.
      duration: this.route.length <= 1 ? MOVE_MS : STEP_MS,
      onComplete: () => {
        this.walk(stub, rest, onComplete);
      },
    });
  }

  /** Показывает события по одному: переезд, удар. Остальные видны в журнале. */
  private showNext(): void {
    const event = this.pending.shift();
    if (event === undefined) {
      this.showing = false;
      const snapshot = this.session.getSnapshot();
      this.drawField(snapshot.state);
      this.placeStacks(snapshot.state);
      this.drawHighlights(snapshot);
      this.time.delayedCall(PAUSE_MS, () => {
        this.session.animationDone();
      });
      return;
    }
    const next = (): void => {
      this.showNext();
    };
    if (event.type === "stackMoved") {
      const stub = this.stubs.get(event.stackId);
      if (stub !== undefined) {
        // Путь известен — идём по нему; иначе сразу в конечную клетку.
        const last = this.route.at(-1);
        const known = last !== undefined && last.col === event.to.col && last.row === event.to.row;
        this.walk(stub, known ? this.route : [event.to], next);
        return;
      }
    }
    if (event.type === "moraleTurn" || event.type === "stackFroze") {
      const stub = this.stubs.get(event.stackId);
      if (stub !== undefined) {
        const label = event.type === "moraleTurn" ? "Боевой дух: ещё ход!" : "Оцепенение";
        showLabel(this, stub, this.stackSize(), label, next);
        return;
      }
    }
    if (event.type === "strike") {
      const stub = this.stubs.get(event.targetId);
      if (stub !== undefined) {
        showStrike(this, stub, this.stackSize(), event, next);
        return;
      }
    }
    next();
  }

  private cellUnder(pointer: Phaser.Input.Pointer): Cell | null {
    return cellAt(this.layout, pointer.x, pointer.y);
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.held = false;
    this.hold?.remove();
    const cell = this.cellUnder(pointer);
    if (cell === null) {
      return;
    }
    this.hold = this.time.delayedCall(HOLD_MS, () => {
      if (pointer.isDown && pointer.getDistance() <= HOLD_SLOP) {
        this.held = true;
        this.session.inspectCell(cell);
      }
    });
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    this.hold?.remove();
    if (this.held || pointer.getDistance() > HOLD_SLOP) {
      return;
    }
    const cell = this.cellUnder(pointer);
    if (cell !== null) {
      this.session.tapCell(cell);
    }
  }
}
