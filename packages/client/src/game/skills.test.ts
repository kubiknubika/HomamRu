// Навыки героя на экране: docs/mechanics/65-hero-skills.md, раздел «Экран».
import { CONTENT } from "@homamru/core/testkit";
import {
  activeStackOf,
  applyCommand,
  createGame,
  findStack,
  playBattleOut,
  spellAtMastery,
} from "@homamru/core";
import type { BattleState, Cell, GameState, HeroState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { highlightsOf } from "../battle/battleHighlights.ts";
import { createBattleSession } from "../battle/battleSession.ts";
import type { BattleSession } from "../battle/battleSession.ts";
import { heroSpellLine, spellLine } from "../battle/battleSpells.ts";
import { startTrialBattle } from "../battle/trialBattle.ts";
import { levelText, levelTitle, skillButton } from "./levelTexts.ts";
import { createSession } from "./session.ts";

/** Партия: герой с 400 соколами в трёх шагах от охранника из `guards` ополченцев. */
function game(guards: number): GameState {
  const created = createGame(
    {
      id: "test",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [{ hero: { x: 0, y: 0, army: [{ creature: "falcon", count: 400 }] } }],
      objects: [{ type: "guard", x: 4, y: 0, creature: "militia", count: guards }],
    },
    1,
    CONTENT,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => error.message).join("\n"));
  }
  return created.state;
}

function heroOf(state: GameState): HeroState {
  const [hero] = state.heroes;
  if (hero === undefined) {
    throw new Error("Героя нет.");
  }
  return hero;
}

/** Состояние после победы над охранником: герою предложены навыки. */
function levelled(guards: number): GameState {
  const moved = applyCommand(game(guards), {
    type: "moveHero",
    player: 0,
    heroId: "A",
    path: ["E", "E", "E"],
  });
  if (!moved.ok) {
    throw new Error(moved.message);
  }
  return playBattleOut(moved.state).state;
}

const caster = (skills: HeroState["skills"]) => ({ spellPower: 2, skills });
const spellOf = (id: string) => {
  const found = CONTENT.spells.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`Заклинания ${id} нет.`);
  }
  return found;
};

/** Проверочный бой, где герой игрока колдует на экспертном уровне всех школ. */
function expert(): BattleSession {
  const { state } = startTrialBattle(1);
  const mine = state.sides[0];
  const hero = mine.hero;
  if (hero === null) {
    throw new Error("Героя нет.");
  }
  const spells = hero.spells.map((item) => spellAtMastery(item, 3));
  const skilled: BattleState = {
    ...state,
    sides: [{ ...mine, hero: { ...hero, spells } }, state.sides[1]],
  };
  const session = createBattleSession(skilled);
  session.animationDone();
  return session;
}

const marksOf = (session: BattleSession): string[] =>
  highlightsOf(session.getSnapshot()).rings.map(({ stack, mark }) => `${stack.id}:${mark}`);

function cellOf(state: BattleState, id: string): Cell {
  const stack = findStack(state, id);
  if (stack === undefined) {
    throw new Error(`Отряда ${id} нет.`);
  }
  return { col: stack.col, row: stack.row };
}

describe("окно нового уровня", () => {
  it("заголовок — уровень, под ним выросшая характеристика; кнопки — что даст навык", () => {
    const hero = { ...heroOf(levelled(100)), skillOffer: ["wisdom", "fire-magic"] as const };
    expect(levelTitle(hero)).toBe("Новый уровень: 2");
    expect(levelText(hero, [{ heroId: "A", level: 2, stat: "attack" }])).toBe(
      "Атака +1. Выберите навык",
    );
    expect(levelText(hero, [{ heroId: "A", level: 2, stat: "spellPower" }])).toBe(
      "Сила магии +1. Выберите навык",
    );
    // Партия поднята из записи: что выросло, уже неизвестно.
    expect(levelText(hero, [])).toBe("Выберите навык");
    expect(skillButton(hero, "wisdom")).toBe(
      "Мудрость (базовый) — герой учит заклинания 3-го круга",
    );
    expect(skillButton(hero, "fire-magic")).toBe(
      "Магия огня (базовый) — заклинания огня дешевле на 1 ману",
    );
  });

  it("повышение взятого навыка называет следующий уровень", () => {
    const hero = {
      ...heroOf(levelled(100)),
      skills: [
        { id: "mysticism", level: 1 },
        { id: "air-magic", level: 2 },
      ] as const,
    };
    expect(skillButton(hero, "mysticism")).toBe("Мистицизм (продвинутый) — 3 маны в день");
    expect(skillButton(hero, "air-magic")).toBe(
      "Магия воздуха (экспертный) — заклинания воздуха ложатся на все отряды",
    );
  });

  it("несколько уровней сразу: окно называет уровень, за который идёт выбор", () => {
    // 200 ополченцев — 2400 опыта: уровни 2 и 3, выборов два.
    const hero = heroOf(levelled(200));
    expect(hero).toMatchObject({ level: 3, skillsOwed: 1 });
    expect(levelTitle(hero)).toBe("Новый уровень: 2");
    expect(levelTitle({ ...hero, skillsOwed: 0 })).toBe("Новый уровень: 3");
  });

  it("пока навык не выбран, «Конец дня» не работает; после выбора — работает", () => {
    const session = createSession(levelled(100));
    const [first] = heroOf(session.getSnapshot().state).skillOffer;
    if (first === undefined) {
      throw new Error("Предложений нет.");
    }
    session.endTurn();
    expect(session.getSnapshot().state.day).toBe(1);
    // Не предложенный навык не берётся.
    session.chooseSkill(first === "wisdom" ? "sorcery" : "wisdom");
    expect(heroOf(session.getSnapshot().state).skills).toEqual([]);

    session.chooseSkill(first);
    const after = session.getSnapshot();
    expect(heroOf(after.state)).toMatchObject({
      skills: [{ id: first, level: 1 }],
      skillOffer: [],
    });
    expect(after.notice?.lines.at(-1)).toMatch(/^Навык: .+ \(базовый\)$/);
    session.endTurn();
    expect(session.getSnapshot().state.day).toBe(2);
  });

  it("уровень, полученный в бою на экране, запоминается: окно знает, что выросло", () => {
    const session = createSession(game(100));
    session.tapCell({ x: 3, y: 0 });
    session.tapCell({ x: 3, y: 0 });
    session.enterBattle();
    const battle = session.getSnapshot().battle;
    if (battle === null) {
      throw new Error("Бой не начался.");
    }
    // Бой доигрывается командами экрана боя: соколы ждут, пока охранник не подойдёт, и бьют.
    for (let step = 0; step < 500 && session.getSnapshot().state.battle !== null; step += 1) {
      battle.animationDone();
      const state = battle.getSnapshot().state;
      const enemy = state.stacks.find((stack) => stack.side === 1 && stack.count > 0);
      const me = activeStackOf(state);
      if (enemy === undefined || me === undefined || me.side !== 0) {
        continue;
      }
      battle.tapCell({ col: enemy.col, row: enemy.row });
      battle.tapCell({ col: enemy.col, row: enemy.row });
      if (battle.getSnapshot().state === state) {
        battle.defend();
      }
    }
    expect(session.getSnapshot().state.battle).toBeNull();
    const { levelUps, state } = session.getSnapshot();
    expect(levelUps).toMatchObject([{ heroId: "A", level: 2 }]);
    expect(levelText(heroOf(state), levelUps)).toMatch(/ \+1\. Выберите навык$/);
  });
});

describe("книга героя с навыками", () => {
  it("без навыка — как раньше; с навыком школы — цена и действие с навыком", () => {
    expect(heroSpellLine(spellOf("magic-arrow"), caster([]))).toBe(
      "Волшебная стрела — 5 маны — урон 30",
    );
    expect(heroSpellLine(spellOf("curse"), caster([{ id: "fire-magic", level: 1 }]))).toBe(
      "Проклятие — 5 маны — наименьший урон, 2 раунда",
    );
    expect(heroSpellLine(spellOf("curse"), caster([{ id: "fire-magic", level: 2 }]))).toBe(
      "Проклятие — 5 маны — наименьший урон −1, 2 раунда",
    );
    expect(heroSpellLine(spellOf("curse"), caster([{ id: "fire-magic", level: 3 }]))).toBe(
      "Проклятие — 5 маны — наименьший урон −1, 2 раунда, на все отряды врага",
    );
    expect(heroSpellLine(spellOf("bless"), caster([{ id: "water-magic", level: 3 }]))).toBe(
      "Благословение — 4 маны — наибольший урон +1, 2 раунда, на все ваши отряды",
    );
    expect(heroSpellLine(spellOf("dispel"), caster([{ id: "water-magic", level: 2 }]))).toBe(
      "Снять заклинания — 4 маны — снимает все заклинания, на любой отряд",
    );
    expect(heroSpellLine(spellOf("dispel"), caster([{ id: "water-magic", level: 3 }]))).toBe(
      "Снять заклинания — 4 маны — снимает все заклинания, на все отряды",
    );
  });

  it("«Волшебная стрела» берёт лучшую из школ; «Волшебство» прибавляет урон", () => {
    const skills = [
      { id: "air-magic", level: 3 },
      { id: "sorcery", level: 3 },
    ] as const;
    // (10 × 2 + 30) × 1,15 = 57,5 → 57.
    expect(heroSpellLine(spellOf("magic-arrow"), caster(skills))).toBe(
      "Волшебная стрела — 4 маны — урон 57",
    );
    expect(spellLine(spellOf("magic-arrow"), { spellPower: 2, sorcery: 15 })).toBe(
      "Волшебная стрела — 5 маны — урон 34",
    );
  });
});

describe("заклинание на все отряды на экране боя", () => {
  it("выбраны сразу все цели; касание любой из них колдует", () => {
    const session = expert();
    const { state } = session.getSnapshot();
    session.chooseSpell("bless");
    expect(marksOf(session)).toEqual(["a3:active", "a1:target", "a2:target", "a3:target"]);
    expect(session.getSnapshot().selection).toMatchObject({
      preview: "Благословение — на все ваши отряды (3): наибольший урон +1, 2 раунда",
    });
    session.tapCell(cellOf(state, "a2"));
    const after = session.getSnapshot().state;
    expect(after.sides[0]).toMatchObject({ cast: true, hero: { mana: 16 } });
    for (const id of ["a1", "a2", "a3"]) {
      expect(findStack(after, id)?.effects.map((effect) => effect.spell)).toEqual(["bless"]);
    }
  });

  it("касание мимо целей снимает выбор; стрела и на экспертном — на один отряд", () => {
    const session = expert();
    const { state } = session.getSnapshot();
    session.chooseSpell("slow");
    expect(marksOf(session)).toEqual(["a3:active", "b1:target", "b2:target", "b3:target"]);
    session.tapCell(cellOf(state, "a1"));
    expect(session.getSnapshot()).toMatchObject({ selection: null, state });

    session.chooseSpell("magic-arrow");
    expect(session.getSnapshot().selection).toMatchObject({ targetId: null, preview: null });
    session.tapCell(cellOf(state, "b1"));
    // 10 × 2 + 30 = 50.
    expect(session.getSnapshot().selection).toMatchObject({
      preview: "Ополченец (враг): урон 50, погибнет 4",
    });
  });
});
