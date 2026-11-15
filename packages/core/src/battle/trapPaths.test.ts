// Путь отряда, компьютер и автобой с ловушками. docs/mechanics/70-spells-field.md.
import { describe, expect, it } from "vitest";
import { ALL_SPELLS, spell } from "../spellKit.ts";
import { chooseCast } from "./aiSpells.ts";
import { randomBattle, runAutoBattle } from "./autobattle.ts";
import { mage } from "./castKit.ts";
import { applyBattleCommand } from "./commands.ts";
import { reachableCells, walkRoute } from "./queries.ts";
import { army, CREATURES, stack, startBattle, turnOf } from "./testkit.ts";
import { lined, sand, wall, withFields } from "./trapKit.ts";

describe("путь и клетки хода", () => {
  it("ловушки не меняют, куда отряд может пойти", () => {
    const plain = lined();
    const trapped = withFields(plain, [sand({ col: 3, row: 5 }, 0), wall([{ col: 3, row: 4 }], 1)]);
    expect([...reachableCells(trapped, stack(trapped, "a1")).keys()].toSorted()).toEqual(
      [...reachableCells(plain, stack(plain, "a1")).keys()].toSorted(),
    );
  });

  it("путь — соседние клетки от отряда до цели, длиной в кратчайший", () => {
    const state = lined();
    const route = walkRoute(state, stack(state, "a1"), { col: 5, row: 5 });
    expect(route).toHaveLength(3);
    expect(route.at(-1)).toEqual({ col: 5, row: 5 });
  });
});

/** Герой, знающий одно заклинание. */
function only(id: string) {
  return mage(2, 100, [spell(id)]);
}

describe("компьютер", () => {
  it("«Мины» и «Пески» колдует, пока у врага есть пешие вдали; второй раз — нет", () => {
    for (const id of ["land-mine", "quicksand"]) {
      const { state } = startBattle(army(["militia:20"], { hero: only(id) }), army(["militia:20"]));
      const ready = turnOf(state, "a1");
      const command = chooseCast(ready, 0);
      expect(command).toMatchObject({ spell: id });
      const after = applyBattleCommand(ready, command ?? { type: "battleFlee", side: 0 });
      expect(after.ok).toBe(true);
      const again = after.ok
        ? {
            ...after.state,
            sides: [{ ...after.state.sides[0], cast: false }, after.state.sides[1]] as const,
          }
        : ready;
      expect(chooseCast(again, 0)).toBe(undefined);
    }
  });

  it("против одних летающих не колдует; «Стену огня» не колдует никогда", () => {
    const flyers = startBattle(
      army(["militia:20"], { hero: only("land-mine") }),
      army(["falcon:10"]),
    );
    expect(chooseCast(turnOf(flyers.state, "a1"), 0)).toBe(undefined);
    const fire = startBattle(
      army(["militia:20"], { hero: only("fire-wall") }),
      army(["militia:20"]),
    );
    expect(chooseCast(turnOf(fire.state, "a1"), 0)).toBe(undefined);
  });
});

describe("автобой с полной книгой", () => {
  it("51 заклинаний; бои заканчиваются без нарушений", () => {
    expect(ALL_SPELLS).toHaveLength(51);
    for (let seed = 101; seed <= 140; seed += 1) {
      const result = runAutoBattle(randomBattle(seed, CREATURES, ALL_SPELLS), CREATURES, seed);
      expect(result.problems).toEqual([]);
    }
  });
});
