/**
 * Заглушки боя (догма 14): поле и отряды рисуются кодом.
 * Настоящие картинки появятся позже и будут искаться по идентификатору существа.
 */
import type { StackState } from "@homamru/core";
import type * as Phaser from "phaser";

export const FIELD_COLOR = 0x4f7a3a;
export const FIELD_LINE_COLOR = 0x23361a;
export const OBSTACLE_COLOR = 0x2b2f36;

/** Цвет и прозрачность подсветки клеток (см. battleHighlights.ts). */
export const CELL_MARK_STYLES = {
  reach: { color: 0xfff3a0, alpha: 0.28 },
  otherReach: { color: 0x3aa0ff, alpha: 0.45 },
  overlap: { color: 0xb04ad8, alpha: 0.6 },
  moveChoice: { color: 0xffffff, alpha: 0.55 },
  attackCell: { color: 0xe2463c, alpha: 0.55 },
  attackChoice: { color: 0xff9a1f, alpha: 0.9 },
} as const;

/** Цвет и толщина обводки отрядов. */
export const RING_MARK_STYLES = {
  active: { color: 0xfff3d6, width: 3 },
  attackable: { color: 0xe2463c, width: 2 },
  target: { color: 0xff9a1f, width: 4 },
  inspected: { color: 0x3aa0ff, width: 3 },
} as const;

/** Цвета сторон: нападающий и обороняющийся. */
const SIDE_COLORS = [0xc8372d, 0x2d6fc8] as const;

const FONT = "system-ui, sans-serif";

export interface StackStub {
  readonly container: Phaser.GameObjects.Container;
  readonly count: Phaser.GameObjects.Text;
}

/**
 * Заглушка отряда: круг цвета стороны с буквой существа и числом существ под ним;
 * у стрелка — жёлтый треугольник.
 */
export function createStackStub(scene: Phaser.Scene, stack: StackState, size: number): StackStub {
  const circle = scene.add.circle(0, -size * 0.1, size * 0.36, SIDE_COLORS[stack.side]);
  circle.setStrokeStyle(2, 0x000000, 0.5);
  const letter = scene.add
    .text(0, -size * 0.1, stack.creature.name.slice(0, 1), {
      fontFamily: FONT,
      fontSize: `${Math.round(size * 0.4)}px`,
      fontStyle: "bold",
      color: "#ffffff",
    })
    .setOrigin(0.5);
  const count = scene.add
    .text(0, size * 0.3, String(stack.count), {
      fontFamily: FONT,
      fontSize: `${Math.max(11, Math.round(size * 0.3))}px`,
      fontStyle: "bold",
      color: "#ffffff",
      backgroundColor: "#14171c",
      padding: { x: 3, y: 0 },
    })
    .setOrigin(0.5);
  const parts: Phaser.GameObjects.GameObject[] = [circle, letter, count];
  if (stack.creature.shots > 0) {
    // Стрелок помечен жёлтым треугольником-«наконечником» справа сверху.
    const tip = size * 0.16;
    const mark = scene.add.triangle(
      size * 0.3,
      -size * 0.38,
      0,
      0,
      tip * 2,
      tip,
      0,
      tip * 2,
      0xffd23f,
    );
    mark.setStrokeStyle(1.5, 0x000000, 0.8);
    parts.push(mark);
  }
  return { container: scene.add.container(0, 0, parts), count };
}

/** Всплывающее число урона над целью. */
export function createDamageText(scene: Phaser.Scene, text: string, size: number) {
  return scene.add
    .text(0, 0, text, {
      fontFamily: FONT,
      fontSize: `${Math.max(14, Math.round(size * 0.45))}px`,
      fontStyle: "bold",
      color: "#ffe08a",
      stroke: "#000000",
      strokeThickness: 4,
    })
    .setOrigin(0.5);
}
