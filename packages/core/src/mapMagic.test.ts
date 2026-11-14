// Магия на стыке карты и боя: docs/mechanics/61-magic.md, 62-battle-spells.md.
import { describe, expect, it } from "vitest";
import { playBattleOut } from "./battleAuto.ts";
import { applyCommand, replay } from "./commands.ts";
import { duel, enemyTown, HOME, put, run, TO_TOWN } from "./duelKit.ts";
import { gameWith, OPEN_FIELD } from "./testkit.ts";
import type { Command, GameState, HeroState } from "./types.ts";

const TO_ZONE: Command = { type: "moveHero", player: 0, heroId: "A", path: ["E", "E", "E"] };
const ARROW: Command = { type: "battleCast", side: 0, spell: "magic-arrow", target: "b1" };

function withHero(state: GameState, changes: Partial<HeroState>): GameState {
  return {
    ...state,
    heroes: state.heroes.map((hero) => (hero.id === "A" ? { ...hero, ...changes } : hero)),
  };
}

/** Герой с данной магией входит в зону охранника из 15 ополченцев: бой начался. */
function inBattle(magic: Partial<HeroState>, army = ["falcon:40"]): GameState {
  const guard = { type: "guard", x: 4, y: 0, creature: "militia", count: 15 } as const;
  return run(withHero(gameWith(OPEN_FIELD, [guard], { army }), magic), TO_ZONE);
}

const MAGE = {
  book: true,
  spells: ["magic-arrow", "bless"],
  spellPower: 3,
  knowledge: 2,
  mana: 20,
};

describe("герой в бою на карте", () => {
  it("в бой идут сила магии, мана и выученные заклинания целиком", () => {
    const hero = inBattle(MAGE).battle?.state.sides[0].hero;
    expect(hero).toMatchObject({ spellPower: 3, mana: 20 });
    expect(hero?.spells.map((spell) => [spell.id, spell.cost])).toEqual([
      ["magic-arrow", 5],
      ["bless", 5],
    ]);
  });

  it("без книги герой в бою заклинаний не знает", () => {
    const state = inBattle({ ...MAGE, book: false });
    expect(state.battle?.state.sides[0].hero?.spells).toEqual([]);
    expect(applyCommand(state, ARROW)).toMatchObject({ ok: false, code: "UNKNOWN_SPELL" });
  });

  it("охранник без героя не колдует", () => {
    const state = inBattle(MAGE);
    expect(state.battle?.state.sides[1].hero).toBeNull();
  });

  it("потраченная в бою мана не возвращается после победы", () => {
    const state = inBattle(MAGE);
    const cast = applyCommand(state, ARROW);
    expect(cast).toMatchObject({ ok: true });
    const after = playBattleOut(cast.ok ? cast.state : state).state;
    expect(after.battle).toBeNull();
    expect(after.heroes[0]).toMatchObject({
      mana: 15,
      book: true,
      spells: ["magic-arrow", "bless"],
    });
  });

  it("без колдовства мана после боя прежняя", () => {
    const after = playBattleOut(inBattle(MAGE)).state;
    expect(after.heroes[0]?.mana).toBe(20);
  });

  it("заклинание, добившее охранника, заканчивает бой на карте: опыт, объект убран", () => {
    // 15 ополченцев — 180 здоровья; сила магии 17 даёт ровно 180.
    const state = inBattle({ ...MAGE, spellPower: 17 });
    const cast = applyCommand(state, ARROW);
    expect(cast).toMatchObject({
      ok: true,
      state: { battle: null, heroes: [{ experience: 180, mana: 15 }] },
    });
  });

  it("вне боя команда колдовства отклоняется", () => {
    const state = withHero(gameWith(OPEN_FIELD, []), MAGE);
    expect(applyCommand(state, ARROW)).toMatchObject({ ok: false, code: "NO_BATTLE" });
  });

  it("повтор команд даёт то же состояние", () => {
    const initial = withHero(
      gameWith(OPEN_FIELD, [{ type: "guard", x: 4, y: 0, creature: "militia", count: 15 }], {
        army: ["falcon:40"],
      }),
      MAGE,
    );
    const start = run(initial, TO_ZONE, ARROW);
    const played = playBattleOut(start);
    const again = replay(initial, [TO_ZONE, ARROW, ...played.commands]);
    expect(again).toMatchObject({ ok: true });
    expect(again.ok ? again.state : null).toEqual(played.state);
  });
});

describe("чужая гильдия", () => {
  it("герой с книгой, взяв город с гильдией, выучивает её заклинания", () => {
    const rich = { ...enemyTown(), buildings: ["tavern", "fort", "mage-guild"] };
    const state = withHero(duel([HOME, rich]), { book: true });
    const taken = run(put(state, "A", 3, 3), TO_TOWN);
    const town = taken.objects.find((object) => object.type === "town" && object.x === 4);
    expect(town).toMatchObject({ owner: 0 });
    expect(taken.heroes[0]?.spells).toEqual(town?.type === "town" ? town.spells : null);
    expect(taken.heroes[0]?.spells).toHaveLength(5);
  });
});
