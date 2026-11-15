// Ловушки на поле боя: пески, мины, стена огня. docs/mechanics/70-spells-field.md.
import { describe, expect, it } from "vitest";
import { applyBattleCommand } from "./commands.ts";
import { cellIndex } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { walkRoute } from "./queries.ts";
import { act, stack, withStacks } from "./testkit.ts";
import { battle, cast, lined, mine, sand, typesOf, wall, withFields } from "./trapKit.ts";

describe("колдовство", () => {
  it.each([
    [0, 4],
    [2, 6],
    [3, 8],
  ])(
    "«Зыбучие пески», уровень школы %i: %i скрытых клеток, по одной на постройку",
    (mastery, count) => {
      const { state, events } = cast(battle(mastery), "quicksand");
      expect(state.fields).toHaveLength(count);
      expect(
        new Set(state.fields.map((field) => cellIndex(field.cells[0] ?? { col: 0, row: 0 }))).size,
      ).toBe(count);
      for (const field of state.fields) {
        expect(field).toMatchObject({ kind: "quicksand", side: 0, rounds: 0, hidden: true });
      }
      expect(typesOf(events)).toEqual(["fieldCast", "fieldPlaced"]);
      expect(state.sides[0].hero?.mana).toBe(mastery === 0 ? 192 : 194);
    },
  );

  it("«Мины»: урон 10 × сила магии + 25, 50 или 100", () => {
    const damages = [0, 2, 3].map((mastery) => {
      const { state } = cast(battle(mastery), "land-mine");
      return [state.fields.length, state.fields[0]?.damage];
    });
    expect(damages).toEqual([
      [4, 45],
      [6, 70],
      [8, 120],
    ]);
  });

  it("клетки случайные, но от сида: тот же бой — те же клетки; на отрядах ловушек нет", () => {
    const first = cast(battle(), "land-mine").state;
    expect(cast(battle(), "land-mine").state.fields).toEqual(first.fields);
    for (const field of first.fields) {
      expect(
        first.stacks.some((item) => cellIndex(item) === cellIndex(field.cells[0] ?? item)),
      ).toBe(false);
    }
  });

  it("«Стена огня»: две клетки, с продвинутого уровня три; урон 10 × сила + 10, 20, 50; срок 2 раунда", () => {
    const at = { col: 7, row: 4 };
    const basic = cast(battle(0), "fire-wall", { cell: at }).state.fields;
    expect(basic).toEqual([
      {
        kind: "fireWall",
        cells: [at, { col: 8, row: 3 }],
        side: 0,
        rounds: 2,
        damage: 30,
        level: 2,
      },
    ]);
    const expert = cast(battle(3), "fire-wall", { cell: at }).state.fields[0];
    expect(expert?.cells).toHaveLength(3);
    expect(expert?.damage).toBe(70);
    const refused = applyBattleCommand(battle(), {
      type: "battleCast",
      side: 0,
      spell: "fire-wall",
      cell: { col: 0, row: 5 },
    });
    expect(refused.ok ? "" : refused.code).toBe("BAD_SPELL_CELL");
  });

  it("постройка поверх скрытой ловушки врага ставится и убирает её; поверх своей — отказ", () => {
    const at = { col: 7, row: 4 };
    const enemy = withFields(battle(), [mine(at, 1)]);
    const { state } = cast(enemy, "force-field", { cell: at });
    expect(state.fields.map((field) => field.kind)).toEqual(["forceField"]);
    const own = withFields(battle(), [mine(at, 0)]);
    const refused = applyBattleCommand(own, {
      type: "battleCast",
      side: 0,
      spell: "force-field",
      cell: at,
    });
    expect(refused.ok ? "" : refused.code).toBe("BAD_SPELL_CELL");
  });
});

describe("зыбучие пески", () => {
  it("пеший, вошедший в скрытые пески врага, останавливается; пески открыты всем", () => {
    const start = withFields(lined(), [sand({ col: 3, row: 5 }, 1)]);
    const { state, events } = act(start, { type: "battleMove", to: { col: 5, row: 5 } });
    expect(stack(state, "a1")).toMatchObject({ col: 3, row: 5 });
    expect(typesOf(events).slice(0, 2)).toEqual(["stackMoved", "stackStuck"]);
    expect(state.fields).toEqual([sand({ col: 3, row: 5 }, 1, false)]);
    expect(state.activeStack).not.toBe("a1");
  });

  it("шёл ударить и увяз — удара нет", () => {
    const start = withStacks(withFields(lined(), [sand({ col: 3, row: 5 }, 1)]), {
      b1: { col: 5, row: 5 },
    });
    const { events } = act(start, { type: "battleAttack", target: "b1", from: { col: 4, row: 5 } });
    expect(typesOf(events)).not.toContain("strike");
  });

  it("свои пески известны: путь их обходит, если есть такой же короткий", () => {
    // До (3, 4) два шага: через (3, 5) или через (2, 4).
    for (const trap of [
      { col: 3, row: 5 },
      { col: 2, row: 4 },
    ]) {
      const own = withFields(lined(), [sand(trap, 0)]);
      const route = walkRoute(own, stack(own, "a1"), { col: 3, row: 4 });
      expect(route).toHaveLength(2);
      expect(route).not.toContainEqual(trap);
    }
    // Скрытых песков врага для отряда нет: путь тот же, что без них.
    const foe = withFields(lined(), [sand({ col: 3, row: 5 }, 1)]);
    expect(walkRoute(foe, stack(foe, "a1"), { col: 4, row: 5 })).toEqual(
      walkRoute(lined(), stack(lined(), "a1"), { col: 4, row: 5 }),
    );
  });

  it("начавший ход в песках выходит свободно; летающему пески не мешают", () => {
    const inSand = withFields(lined(), [sand({ col: 2, row: 5 }, 1, false)]);
    const out = act(inSand, { type: "battleMove", to: { col: 4, row: 5 } });
    expect(stack(out.state, "a1")).toMatchObject({ col: 4, row: 5 });
    const flyer = withFields(lined(0, [["falcon:5"], ["militia:20"]]), [
      sand({ col: 5, row: 5 }, 1),
    ]);
    const landed = act(flyer, { type: "battleMove", to: { col: 5, row: 5 } });
    expect(stack(landed.state, "a1")).toMatchObject({ col: 5, row: 5 });
    expect(typesOf(landed.events)).not.toContain("stackStuck");
    expect(landed.state.fields[0]?.hidden).toBe(true);
  });
});

describe("мины", () => {
  it("вражеский отряд получает урон, мина исчезает, отряд идёт дальше", () => {
    const start = withFields(lined(), [mine({ col: 3, row: 5 }, 1)]);
    const { state, events } = act(start, { type: "battleMove", to: { col: 4, row: 5 } });
    // 45 урона по ополченцам с 12 здоровья: трое погибли, четвёртый ранен на 9.
    expect(stack(state, "a1")).toMatchObject({ col: 4, row: 5, count: 17, firstHealth: 3 });
    expect(state.fields).toEqual([]);
    expect(typesOf(events).slice(0, 3)).toEqual(["stackMoved", "fieldRemoved", "trapDamage"]);
  });

  it("свои отряды ходят по своим минам без вреда; под «Антимагией» мина не срабатывает и остаётся", () => {
    const own = withFields(lined(), [mine({ col: 3, row: 5 }, 0)]);
    const walked = act(own, { type: "battleMove", to: { col: 3, row: 5 } });
    expect(stack(walked.state, "a1").count).toBe(20);
    expect(walked.state.fields).toHaveLength(1);
    const shielded = cast(withFields(lined(3), [mine({ col: 3, row: 5 }, 1)]), "anti-magic", {
      target: "a1",
    }).state;
    const safe = act(shielded, { type: "battleMove", to: { col: 3, row: 5 } });
    expect(stack(safe.state, "a1").count).toBe(20);
    expect(safe.state.fields).toHaveLength(1);
  });

  it("отряд, погибший на мине, не доходит: остаётся в клетке мины", () => {
    const start = withFields(lined(), [mine({ col: 3, row: 5 }, 1, 9999)]);
    const { state, events } = act(start, { type: "battleMove", to: { col: 5, row: 5 } });
    expect(stack(state, "a1")).toMatchObject({ col: 3, row: 5, count: 0 });
    expect(typesOf(events)).toContain("stackDied");
    expect(state.result?.winner).toBe(1);
  });

  it("летающий подрывается, только сев на мину", () => {
    const flyer = lined(0, [["falcon:5"], ["militia:20"]]);
    const over = act(withFields(flyer, [mine({ col: 3, row: 5 }, 1)]), {
      type: "battleMove",
      to: { col: 5, row: 5 },
    });
    expect(typesOf(over.events)).not.toContain("trapDamage");
    const onto = act(withFields(flyer, [mine({ col: 5, row: 5 }, 1)]), {
      type: "battleMove",
      to: { col: 5, row: 5 },
    });
    expect(typesOf(onto.events)).toContain("trapDamage");
  });
});

describe("стена огня", () => {
  it("жжёт любой отряд, и свой; отряд идёт дальше; путь стену обходит", () => {
    const start = withFields(lined(), [wall([{ col: 3, row: 5 }], 0)]);
    const into = act(start, { type: "battleMove", to: { col: 3, row: 5 } });
    // 30 урона: двое погибли, третий ранен на 6.
    expect(stack(into.state, "a1")).toMatchObject({ count: 18, firstHealth: 6 });
    expect(into.state.fields).toHaveLength(1);
    for (const trap of [
      { col: 3, row: 5 },
      { col: 2, row: 4 },
    ]) {
      const around = act(withFields(lined(), [wall([trap], 0)]), {
        type: "battleMove",
        to: { col: 3, row: 4 },
      });
      expect(stack(around.state, "a1").count).toBe(20);
    }
  });

  it("если короткого пути в обход нет — отряд идёт через огонь", () => {
    const boxed = withFields(lined(), [
      wall(
        [
          { col: 3, row: 5 },
          { col: 2, row: 4 },
        ],
        1,
      ),
    ]);
    const { state } = act(boxed, { type: "battleMove", to: { col: 3, row: 4 } });
    expect(stack(state, "a1")).toMatchObject({ col: 3, row: 4, count: 18 });
  });

  it("отряд, закончивший ход в стене, горит ещё раз; ушедший из неё — нет; стена стоит два раунда", () => {
    const start = withStacks(battle(), { b1: { col: 12, row: 5 } });
    const placed = cast(start, "fire-wall", { cell: { col: 12, row: 6 } }).state;
    expect(placed.fields).toHaveLength(1);
    const burning = withFields(placed, [wall([{ col: 12, row: 5 }], 0)]);
    // Начало хода в стене отряд не жжёт: a1 защищается, ход переходит к b1 без урона.
    const first = act(burning, { type: "battleDefend" });
    expect(typesOf(first.events)).not.toContain("trapDamage");
    expect(first.state.activeStack).toBe("b1");
    // b1 защищается, стоя в стене: горит. Начинается второй раунд: стена ещё стоит.
    const second = act(first.state, { type: "battleDefend" });
    expect(typesOf(second.events)).toContain("trapDamage");
    expect(stack(second.state, "b1").count).toBe(18);
    expect(second.state.round).toBe(2);
    expect(second.state.fields.map((field) => field.rounds)).toEqual([1]);
    // Отряд, который из стены ушёл, она не жжёт.
    const left = act(first.state, { type: "battleMove", to: { col: 12, row: 3 } });
    expect(typesOf(left.events)).not.toContain("trapDamage");
  });

  it("«Убрать препятствие»: стену огня — с продвинутого уровня, свои пески — только на экспертном", () => {
    const at = { col: 7, row: 4 };
    const fields = [wall([at], 1), sand({ col: 9, row: 9 }, 0), mine({ col: 9, row: 2 }, 1)];
    const code = (mastery: number, cell: Cell): string => {
      const result = applyBattleCommand(withFields(battle(mastery), fields), {
        type: "battleCast",
        side: 0,
        spell: "remove-obstacle",
        cell,
      });
      return result.ok ? "принята" : result.code;
    };
    expect([0, 2, 3].map((mastery) => code(mastery, at))).toEqual([
      "BAD_SPELL_CELL",
      "принята",
      "принята",
    ]);
    expect([2, 3].map((mastery) => code(mastery, { col: 9, row: 9 }))).toEqual([
      "BAD_SPELL_CELL",
      "принята",
    ]);
    // Скрытую мину врага убрать нельзя: о ней не знают.
    expect(code(3, { col: 9, row: 2 })).toBe("BAD_SPELL_CELL");
  });
});
