// Журнал боя: первая половина — строки боя и осады (16-battle-screen.md, 51-siege-screen.md).
import { describe, expect, it } from "vitest";
import { describeEvents } from "./battleLog.ts";
import { field, line } from "./battleLogKit.ts";

describe("журнал: каждая команда — одной строкой", () => {
  it("в строке названо существо и сторона, а не номер отряда", () => {
    const text = line({ type: "roundStarted", round: 2 });
    expect(text).toBe("Раунд 2");
    expect(line({ type: "stackWaits", stackId: "a1" })).toBe("Ополченец (ваш) ждёт");
    expect(line({ type: "stackWaits", stackId: "b1" })).toBe("Ополченец (враг) ждёт");
    // Сторона считается от того, кто смотрит: у противника «ваш» — его отряд.
    expect(line({ type: "stackWaits", stackId: "b1" }, field(), 1)).toBe("Ополченец (ваш) ждёт");
  });

  it("удар, ответ и выстрел различаются глаголом", () => {
    const base = { damage: 7, killed: 1, left: 9, lucky: false };
    expect(line({ type: "strike", kind: "melee", attackerId: "a1", targetId: "b1", ...base })).toBe(
      "Ополченец (ваш) бьёт: Ополченец (враг), урон 7, погибло 1",
    );
    expect(
      line({ type: "strike", kind: "retaliation", attackerId: "b1", targetId: "a1", ...base }),
    ).toBe("Ополченец (враг) отвечает: Ополченец (ваш), урон 7, погибло 1");
    expect(
      line({ type: "strike", kind: "shot", attackerId: "a1", targetId: "b1", ...base }),
    ).toContain("стреляет");
  });

  it("удача названа в строке удара, а без неё — нет", () => {
    const base = {
      type: "strike",
      kind: "melee",
      attackerId: "a1",
      targetId: "b1",
      damage: 7,
      killed: 1,
      left: 9,
    } as const;
    expect(line({ ...base, lucky: true })).toContain(", удача");
    expect(line({ ...base, lucky: false })).not.toContain("удача");
  });

  it("чей ход и перемещение в журнал не идут, но шаг без удара — идёт", () => {
    expect(line({ type: "stackTurn", stackId: "a1" })).toBe("");
    expect(
      line({ type: "stackMoved", stackId: "a1", from: { col: 4, row: 5 }, to: { col: 5, row: 5 } }),
    ).toBe("Ополченец (ваш) перемещается");
    // Шаг перед ударом не печатается отдельно: строка уже говорит про удар.
    const text = describeEvents(
      [
        { type: "stackMoved", stackId: "a1", from: { col: 4, row: 5 }, to: { col: 5, row: 5 } },
        {
          type: "strike",
          kind: "melee",
          attackerId: "a1",
          targetId: "b1",
          damage: 7,
          killed: 1,
          left: 9,
          lucky: false,
        },
      ],
      field(),
    );
    expect(text).toBe("Ополченец (ваш) бьёт: Ополченец (враг), урон 7, погибло 1");
    expect(text).not.toContain("перемещается");
  });

  it("боевой дух и заморозка стоят в начале строки", () => {
    const text = describeEvents(
      [
        { type: "stackWaits", stackId: "b1" },
        { type: "moraleTurn", stackId: "a1" },
        { type: "stackFroze", stackId: "b1" },
      ],
      field(),
    );
    expect(text.startsWith("Ополченец (ваш): высокий боевой дух")).toBe(true);
    expect(text).toContain("низкий боевой дух");
  });

  it("«защищаться» называет прибавку", () => {
    expect(line({ type: "stackDefends", stackId: "a1", bonus: 6 })).toBe(
      "Ополченец (ваш) защищается: защита +6",
    );
  });
});

describe("журнал: осада", () => {
  it("башни, катапульта и стена названы по-русски", () => {
    expect(
      line({ type: "towerShot", tower: "keep", targetId: "a1", damage: 12, killed: 1, left: 9 }),
    ).toBe("Главная башня стреляет: Ополченец (ваш), урон 12, погибло 1");
    expect(
      line({
        type: "towerShot",
        tower: "upperTower",
        targetId: "a1",
        damage: 1,
        killed: 0,
        left: 10,
      }),
    ).toContain("Верхняя башня");
    expect(line({ type: "catapultShot", aimed: "gate", hit: "gate", damage: 0, left: 2 })).toBe(
      "Катапульта: ворота, без урона",
    );
    expect(line({ type: "catapultShot", aimed: "wall1", hit: "wall1", damage: 1, left: 0 })).toBe(
      "Катапульта: стена, разрушено",
    );
    expect(line({ type: "wallShaken", part: "keep", left: 1 })).toBe(
      "Землетрясение: главная башня, повреждено",
    );
  });

  it("ров назван рвом", () => {
    expect(line({ type: "moatDamage", stackId: "a1", damage: 70, killed: 2, left: 8 })).toBe(
      "Ополченец (ваш) во рву: урон 70, погибло 2",
    );
  });
});
