/** Рисование и простая анимация боя, вынесенные из сцены. */
import type * as Phaser from "phaser";
import { createDamageText } from "./battleStubs.ts";
import type { StackStub } from "./battleStubs.ts";

const STRIKE_MS = 420;
/** Надпись держится дольше удара: её нужно успеть прочитать. */
const LABEL_MS = 900;
const EFFECT_DEPTH = 3;

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
