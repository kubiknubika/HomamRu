import { createRng, nextInt } from "@homamru/core";
import * as Phaser from "phaser";

export const SEED_KEY = "seed";

const COLUMNS = 12;
const ROWS = 8;
const GAP = 2;
const PALETTE = [0x2f6b3a, 0x3f8a4a, 0x8a7a3f, 0x2a5f8a, 0x6b6b6b] as const;

/**
 * Проверочная сцена каркаса: рисует поле клеток, цвета которых выбирает
 * генератор из ядра. Один и тот же сид всегда даёт одну и ту же картинку.
 * Игровых правил здесь нет; сцена будет удалена, когда появится карта.
 */
export class SmokeScene extends Phaser.Scene {
  private graphics: Phaser.GameObjects.Graphics | undefined;

  constructor() {
    super("smoke");
  }

  create(): void {
    this.graphics = this.add.graphics();
    this.registry.events.on(`changedata-${SEED_KEY}`, this.redraw, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.redraw, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off(`changedata-${SEED_KEY}`, this.redraw, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.redraw, this);
    });
    this.redraw();
  }

  private redraw(): void {
    const graphics = this.graphics;
    if (graphics === undefined) {
      return;
    }
    const seed: unknown = this.registry.get(SEED_KEY);
    let rng = createRng(typeof seed === "number" ? seed : 0);

    const { width, height } = this.scale.gameSize;
    const cell = Math.floor(Math.min(width / COLUMNS, height / ROWS));
    const left = Math.floor((width - cell * COLUMNS) / 2);
    const top = Math.floor((height - cell * ROWS) / 2);

    graphics.clear();
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const next = nextInt(rng, 0, PALETTE.length - 1);
        rng = next.rng;
        graphics.fillStyle(PALETTE[next.value] ?? PALETTE[0], 1);
        graphics.fillRect(left + column * cell, top + row * cell, cell - GAP, cell - GAP);
      }
    }
  }
}
