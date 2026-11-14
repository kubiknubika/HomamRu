/** Рисование и простая анимация боя, вынесенные из сцены. */
import type * as Phaser from "phaser";
import {
  createDamageText,
  PROJECTILE_COLOR,
  SPELL_BAD_COLOR,
  SPELL_GOOD_COLOR,
} from "./battleStubs.ts";
import type { StackStub } from "./battleStubs.ts";

const STRIKE_MS = 420;
/** Надпись держится дольше удара: её нужно успеть прочитать. */
const LABEL_MS = 900;
const EFFECT_DEPTH = 3;
const SHOT_MS = 380;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Снаряд летит из точки в точку: выстрел башни или катапульты. */
export function showShot(
  scene: Phaser.Scene,
  from: Point,
  to: Point,
  size: number,
  onComplete: () => void,
): void {
  const ball = scene.add.circle(from.x, from.y, Math.max(3, size * 0.1), PROJECTILE_COLOR);
  ball.setStrokeStyle(1, 0xffffff, 0.8).setDepth(EFFECT_DEPTH);
  scene.tweens.add({
    targets: ball,
    x: to.x,
    y: to.y,
    duration: SHOT_MS,
    onComplete: () => {
      ball.destroy();
      onComplete();
    },
  });
}

/** Надпись всплывает над точкой поля и гаснет: попадание катапульты. */
export function showPointLabel(
  scene: Phaser.Scene,
  at: Point,
  size: number,
  label: string,
  onComplete: () => void,
): void {
  const text = createDamageText(scene, label, size * 0.8);
  text.setPosition(at.x, at.y - size * 0.3).setDepth(EFFECT_DEPTH);
  scene.tweens.add({
    targets: text,
    y: at.y - size,
    alpha: 0,
    duration: LABEL_MS,
    ease: "Cubic.easeIn",
    onComplete: () => {
      text.destroy();
      onComplete();
    },
  });
}

/** Обводит контур клетки по её углам. */
export function tracePath(
  graphics: Phaser.GameObjects.Graphics,
  corners: readonly { readonly x: number; readonly y: number }[],
): void {
  graphics.beginPath();
  for (const [index, corner] of corners.entries()) {
    if (index === 0) {
      graphics.moveTo(corner.x, corner.y);
    } else {
      graphics.lineTo(corner.x, corner.y);
    }
  }
  graphics.closePath();
}

/** Надпись всплывает над отрядом и гаснет: боевой дух, оцепенение. */
export function showLabel(
  scene: Phaser.Scene,
  stub: StackStub,
  size: number,
  label: string,
  onComplete: () => void,
): void {
  const { x, y } = stub.container;
  const text = createDamageText(scene, label, size * 0.8);
  text.setPosition(x, y - size * 0.5).setDepth(EFFECT_DEPTH);
  scene.tweens.add({
    targets: text,
    y: y - size * 1.2,
    alpha: 0,
    duration: LABEL_MS,
    ease: "Cubic.easeIn",
    onComplete: () => {
      text.destroy();
      onComplete();
    },
  });
}

/** Цель мигает, над ней всплывает число урона; число существ обновляется сразу. */
export function showStrike(
  scene: Phaser.Scene,
  stub: StackStub,
  size: number,
  strike: { readonly damage: number; readonly left: number; readonly lucky: boolean },
  onComplete: () => void,
): void {
  const { x, y } = stub.container;
  const text = createDamageText(
    scene,
    strike.lucky ? `−${strike.damage}!` : `−${strike.damage}`,
    size,
  );
  text.setPosition(x, y - size * 0.5).setDepth(EFFECT_DEPTH);
  scene.tweens.add({
    targets: text,
    y: y - size * 1.1,
    alpha: 0,
    duration: STRIKE_MS,
    onComplete: () => {
      text.destroy();
    },
  });
  stub.count.setText(String(strike.left));
  scene.tweens.add({
    targets: stub.container,
    alpha: 0.2,
    duration: STRIKE_MS / 4,
    yoyo: true,
    repeat: 1,
    onComplete: () => {
      stub.container.setAlpha(1).setVisible(strike.left > 0);
      onComplete();
    },
  });
}

interface ShownCast {
  readonly outcome:
    | { readonly kind: "damage"; readonly damage: number; readonly left: number }
    | { readonly kind: "heal" | "dispel" | "effect" };
  /** Заклинание наложено на отряд своей стороны: вспышка зелёная, иначе красная. */
  readonly bySelf: boolean;
}

/** Заклинание: цель дважды вспыхивает цветом; при уроне всплывает число, как при ударе. */
export function showSpell(
  scene: Phaser.Scene,
  stub: StackStub,
  size: number,
  cast: ShownCast,
  onComplete: () => void,
): void {
  const { x, y } = stub.container;
  const { outcome } = cast;
  const color = cast.bySelf ? SPELL_GOOD_COLOR : SPELL_BAD_COLOR;
  const flash = scene.add.circle(x, y - size * 0.1, size * 0.5, color, 0.75);
  flash.setDepth(EFFECT_DEPTH).setAlpha(0);
  if (outcome.kind === "damage") {
    const text = createDamageText(scene, `−${outcome.damage}`, size);
    text.setPosition(x, y - size * 0.5).setDepth(EFFECT_DEPTH + 1);
    scene.tweens.add({
      targets: text,
      y: y - size * 1.1,
      alpha: 0,
      duration: STRIKE_MS * 2,
      onComplete: () => {
        text.destroy();
      },
    });
    stub.count.setText(String(outcome.left));
  }
  scene.tweens.add({
    targets: flash,
    alpha: 1,
    duration: STRIKE_MS / 2,
    yoyo: true,
    repeat: 1,
    onComplete: () => {
      flash.destroy();
      stub.container.setVisible(outcome.kind !== "damage" || outcome.left > 0);
      onComplete();
    },
  });
}
