import { describe, expect, it } from "vitest";
import { createRng, nextFloat, nextInt, nextUint32 } from "./rng.ts";
import type { RngState } from "./rng.ts";

function take(seed: number, count: number): number[] {
  const values: number[] = [];
  let rng = createRng(seed);
  for (let i = 0; i < count; i += 1) {
    const next = nextUint32(rng);
    values.push(next.value);
    rng = next.rng;
  }
  return values;
}

describe("генератор случайных чисел", () => {
  it("даёт одинаковую последовательность для одинакового сида", () => {
    expect(take(12345, 100)).toEqual(take(12345, 100));
  });

  it("даёт разные последовательности для разных сидов", () => {
    expect(take(1, 10)).not.toEqual(take(2, 10));
  });

  it("выдаёт закреплённые эталонные значения", () => {
    // Эталон посчитан отдельной реализацией mulberry32 на Python, а не этим кодом.
    // Если значения изменились, сломаны все сохранения и повторы.
    expect(take(42, 5)).toMatchInlineSnapshot(`
      [
        2581720956,
        1925393290,
        3661312704,
        2876485805,
        750819978,
      ]
    `);
  });

  it("не меняет переданное состояние", () => {
    const rng = createRng(7);
    const copy: RngState = { ...rng };
    nextUint32(rng);
    nextFloat(rng);
    nextInt(rng, 1, 6);
    expect(rng).toEqual(copy);
  });

  it("продолжает последовательность после сохранения и загрузки состояния", () => {
    let rng = createRng(99);
    for (let i = 0; i < 3; i += 1) {
      rng = nextUint32(rng).rng;
    }
    const restored = JSON.parse(JSON.stringify(rng)) as RngState;
    expect(nextUint32(restored).value).toBe(take(99, 4)[3]);
  });

  it("приводит сид к целому без знака", () => {
    expect(createRng(-1)).toEqual({ s: 0xffff_ffff });
    expect(createRng(1.9)).toEqual({ s: 1 });
  });

  it("отвергает бесконечный сид и NaN", () => {
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
    expect(() => createRng(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("выдаёт дробные числа в диапазоне [0, 1)", () => {
    let rng = createRng(5);
    for (let i = 0; i < 1000; i += 1) {
      const next = nextFloat(rng);
      expect(next.value).toBeGreaterThanOrEqual(0);
      expect(next.value).toBeLessThan(1);
      rng = next.rng;
    }
  });

  it("выдаёт целые в заданных границах и достигает обеих границ", () => {
    const seen = new Set<number>();
    let rng = createRng(3);
    for (let i = 0; i < 1000; i += 1) {
      const next = nextInt(rng, 1, 6);
      seen.add(next.value);
      rng = next.rng;
    }
    expect([...seen].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("возвращает границу, если диапазон из одного числа", () => {
    expect(nextInt(createRng(1), 4, 4).value).toBe(4);
  });

  it("отвергает неверные границы", () => {
    const rng = createRng(1);
    expect(() => nextInt(rng, 5, 1)).toThrow(RangeError);
    expect(() => nextInt(rng, 0.5, 2)).toThrow(RangeError);
    expect(() => nextInt(rng, 0, 2 ** 40)).toThrow(RangeError);
  });
});
