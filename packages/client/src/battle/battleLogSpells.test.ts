// Журнал боя: вторая половина — заклинания и жизнь отрядов (60–71, 68-spells-area.md).
import { describe, expect, it } from "vitest";
import { lostCount } from "./battleLog.ts";
import { field, line } from "./battleLogKit.ts";

const SIDE = 0 as const;

describe("журнал: заклинания по полю", () => {
  const cells = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
  ];

  it("своя и чужая постройка различимы, но чужие пески и мины скрыты", () => {
    expect(line({ type: "fieldPlaced", kind: "forceField", cells, side: 0 })).toBe(
      "Силовое поле: клеток — 2",
    );
    expect(line({ type: "fieldPlaced", kind: "fireWall", cells, side: 1 })).toBe(
      "Стена огня: клеток — 2",
    );
    // Свои пески журнал называет, чужие — нет: иначе игрок увидит ловушку.
    expect(line({ type: "fieldPlaced", kind: "quicksand", cells, side: 0 })).toBe(
      "Зыбучие пески: клеток — 2",
    );
    expect(line({ type: "fieldPlaced", kind: "quicksand", cells, side: 1 })).toBe("");
    expect(line({ type: "fieldPlaced", kind: "mine", cells, side: 1 })).toBe("");
    // А найденная мина названа и после чужой постановки.
    expect(line({ type: "fieldRemoved", kind: "mine", cells, reason: "exploded" })).toBe("");
    expect(line({ type: "fieldRemoved", kind: "fireWall", cells, reason: "expired" })).toBe(
      "Стена огня: срок вышел",
    );
  });

  it("постройка, убранная заклинанием, и увязший отряд", () => {
    expect(line({ type: "fieldRemoved", kind: "forceField", cells, reason: "removed" })).toBe(
      "Силовое поле: убрано",
    );
    expect(
      line({
        type: "trapDamage",
        kind: "mine",
        stackId: "a1",
        cell: cells[0] as never,
        damage: 150,
        killed: 3,
        left: 7,
      }),
    ).toBe("Мина: Ополченец (ваш), урон 150, погибло 3");
    expect(line({ type: "stackStuck", stackId: "a1", cell: cells[0] as never })).toBe(
      "Ополченец (ваш) увяз в зыбучих песках",
    );
    expect(line({ type: "obstacleRemoved", cell: cells[0] as never })).toBe("Препятствие убрано");
    expect(
      line({
        type: "stackTeleported",
        stackId: "a1",
        from: cells[0] as never,
        to: cells[1] as never,
      }),
    ).toBe("Ополченец (ваш) перенесён");
  });

  it("колдовство поля названо и своей, и чужой стороной", () => {
    expect(
      line({ type: "fieldCast", side: 0, spell: "fireWall", name: "Стена огня", manaLeft: 4 }),
    ).toBe("Вы колдуете «Стена огня»");
    expect(
      line({ type: "fieldCast", side: 1, spell: "fireWall", name: "Стена огня", manaLeft: 4 }),
    ).toBe("Противник колдует «Стена огня»");
  });
});

describe("журнал: заклинания по отрядам", () => {
  it("урон, лечение, снятие и срок действия — разными словами", () => {
    expect(
      line({
        type: "spellCast",
        side: 0,
        spell: "magicArrow",
        name: "Магическая стрела",
        targetId: "b1",
        outcome: { kind: "damage", damage: 20, killed: 3, left: 7 },
      } as never),
    ).toBe("Вы колдуете «Магическая стрела»: Ополченец (враг), урон 20, погибло 3");
    expect(
      line({
        type: "spellCast",
        side: 1,
        spell: "cure",
        name: "Лечение",
        targetId: "b1",
        outcome: { kind: "heal", healed: 5, removed: [] },
      } as never),
    ).toBe("Противник колдует «Лечение»: Ополченец (враг), вылечено 5");
    expect(
      line({
        type: "spellCast",
        side: 0,
        spell: "dispel",
        name: "Рассеивание",
        targetId: "b1",
        outcome: { kind: "dispel", removed: ["bless"] },
      } as never),
    ).toContain("заклинания сняты");
    expect(
      line({
        type: "spellCast",
        side: 0,
        spell: "bless",
        name: "Благословение",
        targetId: "a1",
        outcome: { kind: "effect", rounds: 3 },
      } as never),
    ).toContain("действует раундов: 3");
    // Насовсем — «до конца боя», а не «0 раундов».
    expect(
      line({
        type: "spellCast",
        side: 0,
        spell: "bless",
        name: "Благословение",
        targetId: "a1",
        outcome: { kind: "effect", rounds: 0 },
      } as never),
    ).toContain("до конца боя");
  });

  it("промах, отражение, слепота и «никого не задело»", () => {
    expect(
      line({ type: "spellMissed", side: 0, spell: "fireball", name: "Огненный шар", manaLeft: 3 }),
    ).toBe("Вы колдуете «Огненный шар»: никого не задело");
    expect(
      line({
        type: "spellReflected",
        stackId: "b1",
        toId: "a1",
        spell: "curse",
        name: "Проклятие",
      }),
    ).toBe("Волшебное зеркало: «Проклятие» отражено на Ополченец (ваш)");
    expect(line({ type: "stackBlind", stackId: "b1" })).toBe(
      "Ополченец (враг): слепота, ход пропущен",
    );
    expect(
      line({ type: "effectEnded", stackId: "a1", spell: "bless", name: "Благословение" }),
    ).toBe("Ополченец (ваш): «Благословение» больше не действует");
    expect(
      line({ type: "fireShield", stackId: "b1", targetId: "a1", damage: 9, killed: 1, left: 9 }),
    ).toContain("Огненный щит");
  });
});

describe("журнал: жизнь и смерть отрядов", () => {
  it("поднятие, клон и жертва названы", () => {
    expect(
      line({ type: "stackRaised", stackId: "a1", raised: 3, healed: 36, lasting: false, left: 9 }),
    ).toBe("Ополченец (ваш): поднято 3 (до конца боя), стало 9");
    expect(
      line({ type: "stackRaised", stackId: "a1", raised: 3, healed: 36, lasting: true, left: 9 }),
    ).toContain("насовсем");
    expect(
      line({
        type: "cloneCreated",
        stackId: "a1",
        cloneId: "a2",
        cell: { col: 0, row: 0 },
        rounds: 3,
      }),
    ).toBe("Ополченец (ваш): появился клон");
    expect(line({ type: "cloneGone", stackId: "a2", reason: "expired" })).toContain("вышел срок");
    expect(line({ type: "cloneGone", stackId: "a2", reason: "dispelled" })).toContain(
      "заклинание снято",
    );
    expect(line({ type: "stackSacrificed", stackId: "a1" })).toBe(
      "Ополченец (ваш): отряд отдан в жертву",
    );
  });

  it("гибель и бегство", () => {
    expect(line({ type: "stackDied", stackId: "b1" })).toBe("Ополченец (враг): отряд погиб");
    expect(line({ type: "sideFled", side: 1 })).toBe("Противник бежал");
    expect(line({ type: "sideFled", side: 0 })).toBe("Вы бежали с поля боя");
  });

  it("берсерк называет, кого бьёт, или что бить некого", () => {
    expect(line({ type: "berserkTurn", stackId: "a1", targetId: "b1" })).toContain(
      "нападает на ближайшего — Ополченец (враг)",
    );
    expect(line({ type: "berserkTurn", stackId: "a1", targetId: null })).toContain("бить некого");
  });

  it("конец боя строки не даёт: об этом говорит не журнал", () => {
    expect(
      line({ type: "battleEnded", result: { winner: SIDE, reason: "destroyed" } as never }),
    ).toBe("");
  });
});

describe("потери отряда", () => {
  it("бежавшая сторона теряет армию целиком", () => {
    const state = field();
    const stack = state.stacks[0] as never;
    expect(lostCount(state, stack)).toBe(0);
    const fled = {
      ...state,
      stacks: state.stacks.map((item) => (item.id === "a1" ? { ...item, count: 6 } : item)),
      result: { winner: 1 as const, reason: "fled" as const, losses: [] },
    };
    expect(lostCount(fled, fled.stacks[0] as never)).toBe(10);
  });
});
