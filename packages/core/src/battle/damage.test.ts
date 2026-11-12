import { describe, expect, it } from "vitest";
import { createRng } from "../rng.ts";
import {
  applyDamage,
  baseDamageOf,
  computeDamage,
  defendBonusOf,
  rollBaseDamage,
} from "./damage.ts";
import { MILITIA, SLINGER } from "./testkit.ts";

const BASES = [1, 2, 7, 25, 100, 999];
const STATS = [0, 1, 5, 6, 20, 33, 34, 65, 66, 100];

describe("базовый урон — таблица из 13-battle-damage.md", () => {
  it.each([
    [3, 8, 8],
    [10, 20, 20],
    [10, 30, 30],
    [25, 25, 62],
    [17, 25, 42],
    [11, 10, 11],
    [100, 40, 400],
    [37, 39, 144],
  ])("существ %i, сумма бросков %i → %i", (count, rollSum, expected) => {
    expect(baseDamageOf(rollSum, count)).toBe(expected);
  });
});

describe("урон — таблица из 13-battle-damage.md", () => {
  it.each<[number, number, number, boolean, number, number]>([
    [25, 5, 5, false, 0, 25],
    [25, 7, 5, false, 0, 27],
    [25, 5, 7, false, 0, 23],
    [25, 10, 5, false, 0, 31],
    [25, 5, 3, true, 0, 52],
    [25, 5, 5, true, 0, 50],
    [25, 5, 7, true, 0, 47],
    [25, 5, 5, false, 1, 12],
    [25, 5, 5, false, 2, 6],
    [25, 7, 5, true, 1, 26],
    [100, 65, 5, false, 0, 400],
    [100, 80, 5, false, 0, 400],
    [100, 5, 33, false, 0, 30],
    [100, 5, 60, false, 0, 30],
    [1, 5, 33, false, 1, 1],
    [3, 5, 9, false, 1, 1],
    [7, 6, 5, false, 0, 7],
    [7, 5, 6, false, 0, 6],
    [33, 8, 5, false, 1, 18],
  ])(
    "база %i, атака %i, защита %i, удача %s, половин %i → %i",
    (base, a, d, lucky, halvings, expected) => {
      expect(computeDamage(base, a, d, lucky, halvings)).toBe(expected);
    },
  );
});

describe("потери — таблица из 13-battle-damage.md", () => {
  it.each([
    [10, 12, 12, 11, 0, 10, 1],
    [10, 12, 12, 12, 1, 9, 12],
    [10, 12, 12, 13, 1, 9, 11],
    [10, 5, 12, 5, 1, 9, 12],
    [10, 5, 12, 4, 0, 10, 1],
    [10, 5, 12, 30, 3, 7, 11],
    [10, 12, 12, 119, 9, 1, 1],
    [10, 12, 12, 120, 10, 0, 0],
    [10, 12, 12, 500, 10, 0, 0],
    [1, 1, 18, 1, 1, 0, 0],
    [5, 9, 9, 20, 2, 3, 7],
    [7, 18, 18, 50, 2, 5, 4],
  ])(
    "существ %i, первое %i, здоровье %i, урон %i → убито %i, осталось %i, первое %i",
    (count, first, health, damage, killed, left, firstAfter) => {
      expect(applyDamage(count, first, health, damage)).toEqual({
        count: left,
        firstHealth: firstAfter,
        killed,
      });
    },
  );
});

describe("прибавка от «защищаться» — таблица из 11-battle-turns.md", () => {
  it.each([
    [1, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [9, 1],
    [10, 2],
    [14, 2],
    [15, 3],
    [23, 4],
  ])("защита %i → +%i", (defense, bonus) => {
    expect(defendBonusOf(defense)).toBe(bonus);
  });
});

describe("свойства урона", () => {
  it("урон не меньше 1 и лежит в пределах от базового × 0,15 до базового × 5", () => {
    for (const base of BASES) {
      for (const attack of STATS) {
        for (const defense of STATS) {
          for (const lucky of [false, true]) {
            const damage = computeDamage(base, attack, defense, lucky, 0);
            expect(damage).toBeGreaterThanOrEqual(Math.max(1, Math.floor((base * 15) / 100)));
            expect(damage).toBeLessThanOrEqual(base * 5);
            expect(computeDamage(base, attack, defense, lucky, 1)).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it("больше атака — урон не меньше; больше защита — урон не больше", () => {
    for (const base of BASES) {
      for (let stat = 0; stat < 80; stat += 1) {
        expect(computeDamage(base, stat + 1, 20, false, 0)).toBeGreaterThanOrEqual(
          computeDamage(base, stat, 20, false, 0),
        );
        expect(computeDamage(base, 20, stat + 1, false, 0)).toBeLessThanOrEqual(
          computeDamage(base, 20, stat, false, 0),
        );
      }
    }
  });

  it("удача не уменьшает урон, половина не увеличивает", () => {
    for (const base of BASES) {
      for (const attack of STATS) {
        for (const defense of STATS) {
          const plain = computeDamage(base, attack, defense, false, 0);
          expect(computeDamage(base, attack, defense, true, 0)).toBeGreaterThanOrEqual(plain);
          expect(computeDamage(base, attack, defense, false, 1)).toBeLessThanOrEqual(plain);
        }
      }
    }
  });

  it("потери: общее здоровье уменьшается ровно на урон, но не ниже нуля", () => {
    for (let count = 1; count <= 12; count += 1) {
      for (let first = 1; first <= 9; first += 1) {
        for (let damage = 1; damage <= 120; damage += 7) {
          const after = applyDamage(count, first, 9, damage);
          const before = (count - 1) * 9 + first;
          const left = after.count === 0 ? 0 : (after.count - 1) * 9 + after.firstHealth;
          expect(after.killed).toBe(count - after.count);
          expect(left).toBe(Math.max(0, before - damage));
        }
      }
    }
  });
});

describe("броски базового урона", () => {
  it("до 10 существ — в пределах «число × от» и «число × до»", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const { value } = rollBaseDamage(createRng(seed), SLINGER, 7);
      expect(value).toBeGreaterThanOrEqual(7 * 1);
      expect(value).toBeLessThanOrEqual(7 * 4);
    }
  });

  it("больше 10 существ — десять бросков, умноженных на число ÷ 10", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const { value } = rollBaseDamage(createRng(seed), MILITIA, 25);
      // Сумма десяти бросков — от 20 до 30; 25 существ: от 50 до 75.
      expect(value).toBeGreaterThanOrEqual(50);
      expect(value).toBeLessThanOrEqual(75);
    }
  });

  it("бросков не больше десяти: генератор продвигается одинаково для 10 и 1000 существ", () => {
    const ten = rollBaseDamage(createRng(5), MILITIA, 10);
    const many = rollBaseDamage(createRng(5), MILITIA, 1000);
    expect(many.rng).toEqual(ten.rng);
    expect(many.value).toBe(ten.value * 100);
  });

  it("одинаковый сид — одинаковый урон", () => {
    expect(rollBaseDamage(createRng(9), SLINGER, 8)).toEqual(
      rollBaseDamage(createRng(9), SLINGER, 8),
    );
  });
});
