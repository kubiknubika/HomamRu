/**
 * Заглушки боя (догма 14): поле и отряды рисуются кодом.
 * Настоящие картинки появятся позже и будут искаться по идентификатору существа.
 */
import type { StackState } from "@homamru/core";
import type * as Phaser from "phaser";

export const FIELD_COLOR = 0x4f7a3a;
export const FIELD_LINE_COLOR = 0x23361a;
export const OBSTACLE_COLOR = 0x2b2f36;
export const REACHABLE_COLOR = 0xfff3a0;
export const SELECTED_COLOR = 0xffffff;
export const ATTACK_CELL_COLOR = 0xe2463c;
export const ACTIVE_OUTLINE_COLOR = 0xfff3d6;
export const TARGET_COLOR = 0xe2463c;

/** Цвета сторон: нападающий и обороняющийся. */
const SIDE_COLORS = [0xc8372d, 0x2d6fc8] as const;

const FONT = "system-ui, sans-serif";

export interface StackStub {
  readonly container: Phaser.GameObjects.Container;
  readonly count: Phaser.GameObjects.Text;
}

/** Заглушка отряда: круг цвета стороны с буквой существа и числом существ под ним. */
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
  return { container: scene.add.container(0, 0, [circle, letter, count]), count };
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
