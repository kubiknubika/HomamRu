/** Размеры и пересчёт координат экрана карты. Без Phaser, чтобы проверять тестами. */
import type { Position } from "@homamru/core";

/** Сторона клетки в единицах мира: 32 логических пикселя ×2 (решение 0005). */
export const TILE = 64;

/** Сторона клетки на экране при обычном масштабе; не меньше 44 (stage-1.md). */
const NORMAL_CELL_PX = 48;
const MIN_CELL_PX = 24;
const MAX_CELL_PX = 96;

export const NORMAL_ZOOM = NORMAL_CELL_PX / TILE;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_CELL_PX / TILE, Math.max(MIN_CELL_PX / TILE, zoom));
}

/** Клетка под точкой мира; вне карты — `null`. */
export function cellAt(
  worldX: number,
  worldY: number,
  width: number,
  height: number,
): Position | null {
  const x = Math.floor(worldX / TILE);
  const y = Math.floor(worldY / TILE);
  return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
}

/** Центр клетки в координатах мира. */
export function cellCenter(cell: Position): Position {
  return { x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 };
}

/**
 * Границы камеры вдоль одной оси. Карта шире экрана — камера не выходит за её
 * край. Карта уже экрана — границы шире карты ровно настолько, чтобы она
 * стояла посередине.
 */
export function cameraBounds(mapSize: number, viewSize: number): { start: number; size: number } {
  const size = Math.max(mapSize, viewSize);
  return { start: (mapSize - size) / 2, size };
}
