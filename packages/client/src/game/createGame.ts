import * as Phaser from "phaser";
import type { FrameMeter } from "./frameMeter.ts";
import { MapScene } from "./mapScene.ts";
import type { Session } from "./session.ts";
import { BACKGROUND_COLOR } from "./stubs.ts";

/** Запускает Phaser внутри указанного элемента страницы. */
export function createGame(
  parent: HTMLElement,
  session: Session,
  frameMeter: FrameMeter,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: BACKGROUND_COLOR,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%",
    },
    scene: [new MapScene(session, frameMeter)],
  });
}
