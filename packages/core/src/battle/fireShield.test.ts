// «Огненный щит»: от какого урона считается доля (69-spells-control.md).
import { describe, expect, it } from "vitest";
import { conjure, faceToFace, plainBattle } from "./castKit.ts";
import { act, stack, strikes, turnOf, withStacks } from "./testkit.ts";
import type { BattleState } from "./types.ts";

function hit(state: BattleState) {
  return act(turnOf(state, "a1"), {
    type: "battleAttack",
    target: "b1",
    from: { col: 5, row: 5 },
  });
}

describe("«Огненный щит»: урон", () => {
  it("доля считается от урона без снижений защитой и «Щитом»; «Волшебство» хозяина её растит", () => {
    const shielded = conjure(faceToFace(plainBattle()), 1, "fire-shield", "b1").state;
    const burntOf = (state: BattleState): number => {
      const found = hit(state).events.find((event) => event.type === "fireShield");
      return found?.type === "fireShield" ? found.damage : 0;
    };
    const plain = burntOf(shielded);
    // Защита цели выше атаки и «Щит» урон удара снижают, а урон щита — нет.
    const tough = withStacks(shielded, {
      b1: { creature: { ...stack(shielded, "b1").creature, defense: 30 } },
    });
    const walled = conjure(tough, 1, "shield", "b1").state;
    const softened = strikes(hit(walled).events)[0]?.damage ?? 0;
    expect(softened).toBeLessThan(strikes(hit(shielded).events)[0]?.damage ?? 0);
    expect(burntOf(walled)).toBeGreaterThanOrEqual(Math.floor(softened / 5) + 1);
    // «Волшебство» 15 % у героя хозяина щита.
    const hero = shielded.sides[1].hero;
    const wise = {
      ...shielded,
      sides: [shielded.sides[0], { ...shielded.sides[1], hero: hero && { ...hero, sorcery: 15 } }],
    } as BattleState;
    expect(burntOf(wise)).toBe(Math.floor((plain * 115) / 100));
  });

  it("щит считает не больше здоровья, которое было у отряда", () => {
    const shielded = conjure(faceToFace(plainBattle()), 1, "fire-shield", "b1").state;
    const frail = withStacks(shielded, { b1: { count: 1, firstHealth: 10 } });
    const { state, events } = hit(frail);
    expect(stack(state, "b1").count).toBe(0);
    expect(events.find((event) => event.type === "fireShield")).toMatchObject({ damage: 2 });
  });
});
