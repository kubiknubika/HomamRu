/**
 * Заглушки (догма 14): всё, что видно на карте, рисуется кодом.
 * Настоящие картинки появятся позже и будут искаться по идентификатору.
 */
import type * as Phaser from "phaser";
import { TILE } from "./geometry.ts";

export const BACKGROUND_COLOR = 0x14171c;

const LAND_COLOR = 0x5d8a43;
const OBSTACLE_COLOR = 0x4a4f5a;
const OBSTACLE_TOP_COLOR = 0x6b7280;
const GRID_COLOR = 0x000000;
const GRID_ALPHA = 0.18;

/** Цвета героев по номеру игрока. */
const PLAYER_COLORS = [0xc8372d, 0x2d6fc8] as const;
const HERO_OUTLINE_COLOR = 0xfff3d6;

/** Часть пути, которую герой пройдёт сегодня, и часть на следующие дни. */
export const PATH_TODAY_COLOR = 0xfff3a0;
export const PATH_LATER_COLOR = 0x9aa3b5;
export const UNREACHABLE_COLOR = 0xe2463c;

export const TERRAIN_TEXTURE = "stub-terrain";
/** Номера плиток в текстуре местности. */
export const LAND_TILE = 0;
export const OBSTACLE_TILE = 1;

function playerColor(player: number): number {
  return PLAYER_COLORS[player] ?? PLAYER_COLORS[0];
}

/** Рисует текстуру местности: две плитки рядом — земля и преграда. */
export function createTerrainTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TERRAIN_TEXTURE)) {
    return;
  }
  const graphics = scene.add.graphics();
  graphics.fillStyle(LAND_COLOR, 1);
  graphics.fillRect(0, 0, TILE, TILE);
  graphics.fillStyle(OBSTACLE_COLOR, 1);
  graphics.fillRect(TILE, 0, TILE, TILE);
  // Светлая «крыша» у преграды, чтобы её нельзя было спутать с землёй.
  const inset = TILE / 8;
  graphics.fillStyle(OBSTACLE_TOP_COLOR, 1);
  graphics.fillRect(TILE + inset, inset, TILE - inset * 2, TILE - inset * 2);
  // Тонкая рамка по краю каждой плитки даёт видимую сетку.
  graphics.lineStyle(2, GRID_COLOR, GRID_ALPHA);
  graphics.strokeRect(1, 1, TILE - 2, TILE - 2);
  graphics.strokeRect(TILE + 1, 1, TILE - 2, TILE - 2);
  graphics.generateTexture(TERRAIN_TEXTURE, TILE * 2, TILE);
  graphics.destroy();
}

/** Заглушка героя: круг цвета игрока с буквой героя. */
export function createHeroStub(
  scene: Phaser.Scene,
  heroId: string,
  owner: number,
): Phaser.GameObjects.Container {
  const circle = scene.add.circle(0, 0, TILE * 0.36, playerColor(owner));
  circle.setStrokeStyle(4, HERO_OUTLINE_COLOR);
  const letter = scene.add
    .text(0, 0, heroId, {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${TILE * 0.42}px`,
      fontStyle: "bold",
      color: "#ffffff",
    })
    .setOrigin(0.5);
  return scene.add.container(0, 0, [circle, letter]);
}
