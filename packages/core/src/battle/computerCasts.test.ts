/**
 * Что компьютер колдует сам, а что нет — факт, а не мнение.
 *
 * Этот файл-сторож появился из ошибки: в «Исправить» долго стояли две записи —
 * «компьютер не ставит постройки полей» и «не колдует „Воскрешение“». Обе были
 * неверны: цена построек есть в `aiField.ts`, воскрешение — в `aiLife.ts`.
 * Ошибка держалась потому, что ни один тест не проверял сам факт колдовства.
 *
 * Спецификации: docs/mechanics/63-opponent-magic.md, 70-spells-field.md, 71-spells-life.md.
 */
import { describe, expect, it } from "vitest";
import { runAutoBattle, randomBattle } from "./autobattle.ts";
import type { BattleDefinition } from "./types.ts";
import { CREATURES } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { SpellDefinition } from "../spells.ts";

/** Щедрая магия: иначе дорогие заклинания не попадут в перебор. */
const MAGIC = { spellPower: 4, mana: 80 } as const;

/** Бой, в книге у обеих сторон только `spells`. */
function battleWith(seed: number, spells: readonly SpellDefinition[]): BattleDefinition {
  const base = randomBattle(seed, CREATURES);
  const army = (side: 0 | 1) => ({
    ...(side === 0 ? base.attacker : base.defender),
    hero: { attack: 0, defense: 0, ...MAGIC, spells },
  });
  return { ...base, attacker: army(0), defender: army(1) };
}

/** Сколько раз компьютер колдовал каждое заклинание за прогон. */
function castCounts(spells: readonly SpellDefinition[], seeds: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let seed = 1; seed <= seeds; seed += 1) {
    const run = runAutoBattle(battleWith(seed, spells), CREATURES, seed);
    for (const command of run.commands) {
      if (command.type === "battleCast") {
        const key = String(command.spell);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

const spellsWith = (...effects: string[]): SpellDefinition[] =>
  GAME_SPELLS.filter((spell) => effects.includes(spell.effect));

describe("что компьютер колдует сам", () => {
  /**
   * Главное: «Воскрешение» компьютер колдует. Раньше считалось, что не умеет,
   * и свойство жизни на случайных боях проверялось вхолостую.
   */
  it("«Воскрешение» компьютер колдует", () => {
    const life = spellsWith("resurrect", "clone", "heal", "cure");
    expect(life.length).toBeGreaterThan(0);
    const counts = castCounts(life, 40);
    expect(counts.get("resurrection") ?? 0).toBeGreaterThan(0);
  });

  /**
   * Второе: постройки полей он ставить умеет. Проверяем на книге из одних построек —
   * в обычном бою их перебивают урон-заклинания, и «ноль» там ничего не значит.
   */
  it("«Зыбучие пески» и «Телепорт» компьютер ставит", () => {
    const field = spellsWith("quicksand", "teleport", "mine");
    expect(field.length).toBeGreaterThan(1);
    const counts = castCounts(field, 40);
    expect(counts.get("quicksand") ?? 0).toBeGreaterThan(0);
    expect(counts.get("teleport") ?? 0).toBeGreaterThan(0);
  });

  /**
   * Третье, и это уже не ошибка, а решение: «Стена огня», «Силовое поле» и
   * «Убрать препятствие» не колдуются — так записано в 70-spells-field.md.
   */
  it("«Стена огня», «Силовое поле», «Убрать препятствие» не колдуются", () => {
    const forbidden = spellsWith("fireWall", "forceField", "removeObstacle");
    expect(forbidden.length).toBe(3);
    const counts = castCounts(forbidden, 40);
    expect([...counts.keys()]).toEqual([]);
  });
});
