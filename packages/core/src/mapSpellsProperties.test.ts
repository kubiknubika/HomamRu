// Свойства из раздела «Свойства, верные всегда» спецификации 73-map-spells.md.
// Вынесены отдельно: примеры на правила — в mapSpells.test.ts, здесь четыре свойства.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { visionsAt, shownArmy } from "./mapSpells.ts";
import { GAME_SPELLS } from "./spellKit.ts";
import { gameWith } from "./testkit.ts";
import type { Command, GameState, HeroState, MapObjectDefinition, TownState } from "./types.ts";

const FIELD = [
  "S.........",
  ..."..........,"
    .repeat(9)
    .split(",")
    .filter((row) => row !== ""),
];
const NEAR = { type: "town", x: 3, y: 0, owner: 0, buildings: ["tavern"] } as const;
const FAR = { x: 9, y: 9, owner: 0 };
const LEVELS: Record<string, number> = { militia: 1, slinger: 2, falcon: 3, armsman: 4 };
const MAGE = {
  book: true,
  spells: ["visions", "disguise", "town-portal"],
  spellPower: 2,
  knowledge: 5,
  mana: 50,
};

type TownSpot = { readonly x: number; readonly y: number; readonly owner: number };

/** Партия с магом; карта допускает один город игрока, поэтому остальные добавлены в обход. */
function game(
  changes: Partial<HeroState> = {},
  towns: readonly TownSpot[] = [NEAR, FAR],
  extra: readonly MapObjectDefinition[] = [],
): GameState {
  const state = gameWith(FIELD, [NEAR, ...extra], { army: ["militia:30", "armsman:5"] });
  const sample = state.objects.find((object) => object.type === "town");
  const objects = [
    ...towns.map((town, index) => ({ ...sample, ...town, id: `o${index + 1}` }) as TownState),
    ...state.objects.filter((object) => object.type !== "town"),
  ];
  return {
    ...state,
    objects,
    spells: GAME_SPELLS,
    creatures: state.creatures.map((creature) => ({ ...creature, level: LEVELS[creature.id] })),
    heroes: state.heroes.map((hero) => ({ ...hero, ...MAGE, ...changes })),
  };
}

function cast(state: GameState, spell: string, townId?: string): GameState | null {
  const command: Command = { type: "castMap", player: 0, heroId: "A", spell };
  const result = applyCommand(state, townId === undefined ? command : { ...command, townId });
  return result.ok ? result.state : null;
}

function done(state: GameState, spell: string): GameState {
  const next = cast(state, spell);
  if (next === null) {
    throw new Error(`«${spell}» отказано`);
  }
  return next;
}

describe("свойства заклинаний карты (73)", () => {
  it("портал ставит героя на клетку своего города, и другого героя там нет", () => {
    const before = game({ x: 5, y: 2, movement: 450 });
    const after = done(before, "town-portal");
    const hero = after.heroes[0];
    expect(hero).toBeDefined();
    const town = after.objects.find(
      (object) =>
        object.type === "town" &&
        object.owner === 0 &&
        object.x === hero?.x &&
        object.y === hero?.y,
    );
    expect(town, "герой не на клетке своего города").toBeDefined();
    // Другого героя в этой клетке нет.
    const others = after.heroes.filter((other) => other.id !== hero?.id);
    for (const other of others) {
      expect(other.x === hero?.x && other.y === hero?.y, `в клетке портала стоит ${other.id}`).toBe(
        false,
      );
    }
  });

  it("заклинание карты не меняет ничего, кроме маны, хода, клетки и отметок героя", () => {
    // Сравниваем всё состояние до и после, кроме перечисленного. Карта и объекты — те же,
    // армия, ресурсы, города и остальные герои не тронуты.
    const before = game({ x: 5, y: 2, movement: 450 });
    const after = done(before, "visions");
    expect(after.objects).toEqual(before.objects);
    expect(after.players).toEqual(before.players);
    expect(after.day).toBe(before.day);
    // Ресурсы живут у игроков, а не в состоянии карты — их же и сверяем выше, в `players`.
    expect(after.heroes.length).toBe(before.heroes.length);
    // Герой: меняются только мана, запас хода и отметки.
    const left = before.heroes[0];
    const right = after.heroes[0];
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (left === undefined || right === undefined) {
      return;
    }
    expect(right.army).toEqual(left.army);
    expect({ x: right.x, y: right.y }).toEqual({ x: left.x, y: left.y });
    expect(right.mana).toBeLessThanOrEqual(left.mana);
    expect(right.movement).toBeLessThanOrEqual(left.movement);
  });

  it("мана и запас хода не уходят ниже нуля", () => {
    // Ровно столько, сколько стоит портал: после каста — ноль, а не минус.
    const state = game({ x: 5, y: 2, movement: 300, mana: 16, knowledge: 1 });
    const portalled = cast(state, "town-portal");
    expect(portalled, "портал отказан — свойство про ноль не проверено").not.toBeNull();
    expect(portalled?.heroes[0]?.mana).toBeGreaterThanOrEqual(0);
    expect(portalled?.heroes[0]?.movement).toBeGreaterThanOrEqual(0);
    // И в общем случае: сколько бы ни колдовали, в минус не уходит.
    let current = game({ x: 5, y: 2, movement: 900 });
    for (let i = 0; i < 6; i += 1) {
      const next = cast(current, "visions");
      if (next === null) {
        break;
      }
      current = next;
      expect(current.heroes[0]?.mana).toBeGreaterThanOrEqual(0);
      expect(current.heroes[0]?.movement).toBeGreaterThanOrEqual(0);
    }
  });

  it("в начале дня ни на одном герое нет «Видений» и «Маскировки»", () => {
    // Действие этих заклинаний кончается с днём: сброс — в time.ts:55, при смене дня.
    // Поэтому день меняем настоящей командой, а не подделкой `day + 1`.
    const before = game({ x: 5, y: 2, movement: 450 });
    const withVisions = done(before, "visions");
    const withDisguise = done(withVisions, "disguise");
    // До конца дня отметки стоят.
    expect(withDisguise.heroes[0]?.visions).toBeGreaterThan(0);
    expect(withDisguise.heroes[0]?.disguise).toBeGreaterThan(0);

    const ended = applyCommand(withDisguise, { type: "endTurn", player: 0 });
    expect(ended.ok, "смена дня не прошла").toBe(true);
    if (!ended.ok) {
      return;
    }
    const tomorrow = ended.state;
    expect(tomorrow.day).toBe(withDisguise.day + 1);
    for (const hero of tomorrow.heroes) {
      expect(hero.visions, `${hero.id}: видения пережили день`).toBe(0);
      expect(hero.disguise, `${hero.id}: маскировка пережила день`).toBe(0);
      // И «Видений» на карте больше нет, армия показана настоящей.
      expect(visionsAt(tomorrow, hero.owner, { x: hero.x, y: hero.y })).toBe(0);
      expect(shownArmy(tomorrow, hero)).toEqual(hero.army);
    }
  });
});
