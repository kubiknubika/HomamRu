/**
 * Заглушки объектов карты (догма 14): кучки, шахты, охранники, города рисуются кодом.
 * Как они выглядят: docs/mechanics/24-map-screen.md, «Что добавляется на карте».
 */
import { MINE_INCOME } from "@homamru/core";
import type { ObjectState } from "@homamru/core";
import type * as Phaser from "phaser";
import { TILE } from "./geometry.ts";
import { playerColor } from "./stubs.ts";

/** Цвета ресурсов: золото жёлтое, дерево коричневое, руда серая. */
const RESOURCE_COLORS = { gold: 0xe9c53a, wood: 0x8b5a2b, ore: 0xa3a9b3 } as const;
const OUTLINE_COLOR = 0x1b1e24;
/** Охранник никому не принадлежит: цвет не совпадает ни с одним игроком. */
const GUARD_COLOR = 0x8a6fa8;
const GUARD_OUTLINE_COLOR = 0xf0e6ff;
const FLAG_POLE_COLOR = 0xf4f4f4;
const TOWN_OUTLINE_COLOR = 0xfff3d6;

/** Зона охранника и он сам, когда показан путь, который кончается боем. */
export const ZONE_COLOR = 0xe2463c;
export const ZONE_ALPHA = 0.28;

const LETTER_STYLE = {
  fontFamily: "system-ui, sans-serif",
  fontSize: `${TILE * 0.4}px`,
  fontStyle: "bold",
  color: "#ffffff",
} as const;

/**
 * По чему видно, что заглушку пора перерисовать: у шахты меняется владелец,
 * остальные объекты не меняются, пока существуют.
 */
export function objectStubKey(object: ObjectState): string {
  return object.type === "mine" ? `mine:${object.owner ?? "-"}` : object.type;
}

/** Кучка: маленький ромб цвета ресурса. */
function pileParts(scene: Phaser.Scene, color: number): Phaser.GameObjects.GameObject[] {
  const size = TILE * 0.34;
  const diamond = scene.add.rectangle(0, 0, size, size, color).setAngle(45);
  diamond.setStrokeStyle(3, OUTLINE_COLOR);
  return [diamond];
}

/** Город: крупный значок цвета владельца с буквой «Г» (33-town-screen.md). */
function townParts(scene: Phaser.Scene, owner: number): Phaser.GameObjects.GameObject[] {
  const size = TILE * 0.9;
  const walls = scene.add.rectangle(0, 0, size, size, playerColor(owner));
  walls.setStrokeStyle(5, TOWN_OUTLINE_COLOR);
  const letter = scene.add
    .text(0, 0, "Г", { ...LETTER_STYLE, fontSize: `${TILE * 0.56}px` })
    .setOrigin(0.5);
  return [walls, letter];
}

/** Шахта: квадрат цвета ресурса; у занятой — флажок цвета владельца. */
function mineParts(
  scene: Phaser.Scene,
  color: number,
  owner: number | null,
): Phaser.GameObjects.GameObject[] {
  const size = TILE * 0.7;
  const square = scene.add.rectangle(0, 0, size, size, color);
  square.setStrokeStyle(4, OUTLINE_COLOR);
  if (owner === null) {
    return [square];
  }
  const top = -TILE * 0.46;
  const pole = scene.add.rectangle(0, top + TILE * 0.2, 4, TILE * 0.44, FLAG_POLE_COLOR);
  const flag = scene.add.triangle(
    TILE * 0.13,
    top + TILE * 0.09,
    0,
    0,
    0,
    TILE * 0.22,
    TILE * 0.26,
    TILE * 0.11,
    playerColor(owner),
  );
  flag.setStrokeStyle(2, OUTLINE_COLOR);
  return [square, pole, flag];
}

/** Охранник: фигура нейтрального цвета с буквой существа. Числа на ней нет. */
function guardParts(scene: Phaser.Scene, letter: string): Phaser.GameObjects.GameObject[] {
  const size = TILE * 0.62;
  const body = scene.add.rectangle(0, 0, size, size, GUARD_COLOR).setAngle(45);
  body.setStrokeStyle(4, GUARD_OUTLINE_COLOR);
  const text = scene.add.text(0, 0, letter, LETTER_STYLE).setOrigin(0.5);
  return [body, text];
}

/** Заглушка объекта карты; `creatureName` — название существа охранника. */
export function createObjectStub(
  scene: Phaser.Scene,
  object: ObjectState,
  creatureName: string,
): Phaser.GameObjects.Container {
  if (object.type === "pile") {
    return scene.add.container(0, 0, pileParts(scene, RESOURCE_COLORS[object.resource]));
  }
  if (object.type === "guard") {
    return scene.add.container(0, 0, guardParts(scene, creatureName.slice(0, 1).toUpperCase()));
  }
  if (object.type === "town") {
    return scene.add.container(0, 0, townParts(scene, object.owner));
  }
  const color = RESOURCE_COLORS[MINE_INCOME[object.kind].resource];
  return scene.add.container(0, 0, mineParts(scene, color, object.owner));
}
