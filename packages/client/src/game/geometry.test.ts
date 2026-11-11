import { describe, expect, it } from "vitest";
import { cameraBounds, cellAt, cellCenter, clampZoom, NORMAL_ZOOM, TILE } from "./geometry.ts";

describe("геометрия экрана карты", () => {
  it("клетка при обычном масштабе не меньше 44 пикселей экрана", () => {
    expect(TILE * NORMAL_ZOOM).toBeGreaterThanOrEqual(44);
    expect(clampZoom(NORMAL_ZOOM)).toBe(NORMAL_ZOOM);
  });

  it("масштаб ограничен с обеих сторон", () => {
    expect(TILE * clampZoom(0.01)).toBe(24);
    expect(TILE * clampZoom(100)).toBe(96);
  });

  it("находит клетку под точкой мира", () => {
    expect(cellAt(0, 0, 8, 8)).toEqual({ x: 0, y: 0 });
    expect(cellAt(63.9, 64, 8, 8)).toEqual({ x: 0, y: 1 });
    expect(cellAt(8 * TILE - 1, 8 * TILE - 1, 8, 8)).toEqual({ x: 7, y: 7 });
  });

  it("не находит клетку вне карты", () => {
    expect(cellAt(-1, 10, 8, 8)).toBeNull();
    expect(cellAt(10, -0.1, 8, 8)).toBeNull();
    expect(cellAt(8 * TILE, 10, 8, 8)).toBeNull();
    expect(cellAt(10, 8 * TILE, 8, 8)).toBeNull();
  });

  it("центр клетки лежит в этой же клетке", () => {
    expect(cellCenter({ x: 2, y: 3 })).toEqual({ x: 160, y: 224 });
    const center = cellCenter({ x: 5, y: 7 });
    expect(cellAt(center.x, center.y, 8, 8)).toEqual({ x: 5, y: 7 });
  });

  it("большая карта: камера не выходит за край", () => {
    expect(cameraBounds(4608, 800)).toEqual({ start: 0, size: 4608 });
  });

  it("маленькая карта стоит посередине экрана", () => {
    expect(cameraBounds(512, 800)).toEqual({ start: -144, size: 800 });
  });
});
