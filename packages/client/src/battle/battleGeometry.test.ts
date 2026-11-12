import { describe, expect, it } from "vitest";
import { cellAt, cellCenter, cellCorners, layoutOf } from "./battleGeometry.ts";

describe("размер клетки под экран", () => {
  it("поле целиком помещается в отведённое место и стоит по центру", () => {
    for (const [width, height] of [
      [648, 330],
      [1100, 600],
      [400, 700],
      [2000, 300],
    ] as const) {
      const area = { x: 10, y: 20, width, height };
      const layout = layoutOf(area);
      const fieldWidth = layout.cellWidth * 15.5;
      const fieldHeight = layout.radius * 17;
      expect(fieldWidth).toBeLessThanOrEqual(width + 1e-9);
      expect(fieldHeight).toBeLessThanOrEqual(height + 1e-9);
      expect(layout.x - area.x).toBeCloseTo(area.x + width - (layout.x + fieldWidth));
      expect(layout.y - area.y).toBeCloseTo(area.y + height - (layout.y + fieldHeight));
    }
  });

  it("на высоком экране клетка — правильный шестиугольник", () => {
    const layout = layoutOf({ x: 0, y: 0, width: 620, height: 2000 });
    expect(layout.cellWidth).toBeCloseTo(40);
    expect(layout.radius).toBeCloseTo(40 / Math.sqrt(3));
  });

  it("на низком экране клетка растягивается в ширину, но не больше чем в 1,6 раза", () => {
    const layout = layoutOf({ x: 0, y: 0, width: 2000, height: 340 });
    expect(layout.radius).toBeCloseTo(20);
    expect(layout.cellWidth).toBeCloseTo(20 * Math.sqrt(3) * 1.6);
  });
});

describe("бюджет: клетка не уже 44 пикселей на экране шириной от 720 — stage-2.md", () => {
  it("телефон 720×360: за вычетом полей и нижней панели", () => {
    const layout = layoutOf({ x: 6, y: 6, width: 708, height: 276 });
    expect(layout.cellWidth).toBeGreaterThanOrEqual(44);
  });
});

describe("клетки на экране", () => {
  const layout = layoutOf({ x: 0, y: 0, width: 775, height: 2000 });

  it("чётные ряды сдвинуты вправо на полклетки", () => {
    expect(layout.cellWidth).toBeCloseTo(50);
    expect(cellCenter(layout, { col: 0, row: 0 }).x).toBeCloseTo(50);
    expect(cellCenter(layout, { col: 0, row: 1 }).x).toBeCloseTo(25);
    expect(cellCenter(layout, { col: 3, row: 4 }).x).toBeCloseTo(200);
  });

  it("соседние клетки стоят вплотную: расстояние между центрами равно ширине клетки", () => {
    const a = cellCenter(layout, { col: 3, row: 4 });
    for (const neighbour of [
      { col: 4, row: 4 },
      { col: 3, row: 5 },
      { col: 4, row: 5 },
      { col: 3, row: 3 },
    ]) {
      const b = cellCenter(layout, neighbour);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(50);
    }
  });

  it("у клетки шесть углов вокруг центра", () => {
    const center = cellCenter(layout, { col: 2, row: 2 });
    const corners = cellCorners(layout, { col: 2, row: 2 });
    expect(corners).toHaveLength(6);
    expect(corners[0]).toEqual({ x: center.x, y: center.y - layout.radius });
    expect(corners[3]).toEqual({ x: center.x, y: center.y + layout.radius });
  });

  it("точка рядом с центром клетки попадает в эту клетку — на любом экране", () => {
    for (const area of [
      { x: 0, y: 0, width: 775, height: 2000 },
      { x: 6, y: 6, width: 648, height: 330 },
    ]) {
      const fitted = layoutOf(area);
      for (let row = 0; row < 11; row += 1) {
        for (let col = 0; col < 15; col += 1) {
          const center = cellCenter(fitted, { col, row });
          const x = center.x + fitted.cellWidth * 0.3;
          const y = center.y - fitted.radius * 0.4;
          expect(cellAt(fitted, x, y)).toEqual({ col, row });
        }
      }
    }
  });

  it("точка за краем поля не попадает никуда", () => {
    expect(cellAt(layout, -40, 100)).toBeNull();
    expect(cellAt(layout, 400, -60)).toBeNull();
    const last = cellCenter(layout, { col: 14, row: 10 });
    expect(cellAt(layout, last.x + 60, last.y)).toBeNull();
  });
});
