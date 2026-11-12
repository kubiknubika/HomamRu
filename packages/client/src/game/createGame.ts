import * as Phaser from "phaser";
import { BattleScene } from "../battle/battleScene.ts";
import type { BattleSession } from "../battle/battleSession.ts";
import type { FrameMeter } from "./frameMeter.ts";
import { MapScene } from "./mapScene.ts";
import type { Session } from "./session.ts";
import { BACKGROUND_COLOR } from "./stubs.ts";

function startPhaser(parent: HTMLElement, scene: Phaser.Scene): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: BACKGROUND_COLOR,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%",
    },
    scene: [scene],
  });
}

/** Запускает Phaser с картой внутри указанного элемента страницы. */
export function createGame(
  parent: HTMLElement,
  session: Session,
  frameMeter: FrameMeter,
): Phaser.Game {
  return startPhaser(parent, new MapScene(session, frameMeter));
}

/** Запускает Phaser с боем внутри указанного элемента страницы. */
export function createBattleGame(
  parent: HTMLElement,
  battle: BattleSession,
  frameMeter: FrameMeter,
): Phaser.Game {
  return startPhaser(parent, new BattleScene(battle, frameMeter));
}
