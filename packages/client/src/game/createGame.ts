import * as Phaser from "phaser";
import { SEED_KEY, SmokeScene } from "./smokeScene.ts";

export interface GameHandle {
  setSeed(seed: number): void;
}

/** Запускает Phaser внутри указанного элемента страницы. */
export function createGame(parent: HTMLElement, seed: number): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: "#14171c",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%",
    },
    callbacks: {
      preBoot: (booting) => {
        booting.registry.set(SEED_KEY, seed);
      },
    },
    scene: [SmokeScene],
  });

  return {
    setSeed: (next) => {
      game.registry.set(SEED_KEY, next);
    },
  };
}
