// Нейтральные существа (docs/content/creatures.md, порция 65): 15 штук, уровни 1–10.
// Состав и уровни — из VCMI `config/creatures/neutral.json`. Живут только в охранниках
// и на карте: жилищ у них нет, нанимать их негде.
import { describe, expect, it } from "vitest";
import { NEUTRAL_CREATURES } from "./battle/neutralKit.ts";
import { applyCommand } from "./commands.ts";
import { createGame } from "./game.ts";
import { CONTENT, OPEN_FIELD } from "./testkit.ts";
import type { CreatureDefinition } from "./battle/types.ts";
import type { GameContent } from "./tavernTypes.ts";
import type { GameState } from "./types.ts";

/** Имена и уровни — из VCMI. Порядок здесь тот же, что в наборе: так видно пропажу. */
const LEVELS: readonly (readonly [string, number])[] = [
  ["peasant", 1],
  ["halfling", 1],
  ["boar", 2],
  ["rogue", 2],
  ["mummy", 3],
  ["nomad", 3],
  ["sharpshooter", 4],
  ["golem-gold", 5],
  ["troll", 5],
  ["enchanter", 6],
  ["golem-diamond", 6],
  ["dragon-fairie", 8],
  ["dragon-rust", 10],
  ["dragon-crystal", 10],
  ["dragon-azure", 10],
];

const PLAYABLE: GameContent = {
  ...CONTENT,
  creatures: [...CONTENT.creatures, ...NEUTRAL_CREATURES],
};

/** Партия с охранником из нейтралов: герой в углу, охранник через клетку (рядом нельзя). */
function game(creature: string, count = 4): GameState {
  const created = createGame(
    {
      id: "neutral",
      name: "Нейтралы",
      terrain: OPEN_FIELD.map((row) => row.replaceAll("S", ".")),
      players: [{ hero: { x: 0, y: 0, army: [{ creature: "militia", count: 10 }] } }],
      objects: [{ type: "guard", x: 2, y: 0, creature, count }],
    },
    1,
    PLAYABLE,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => `${error.field}: ${error.message}`).join("; "));
  }
  return created.state;
}

describe("нейтральные существа", () => {
  it("в наборе ровно пятнадцать нейтралов с уровнями из VCMI", () => {
    const ours = NEUTRAL_CREATURES.map(
      (creature) => [creature.id, creature.level ?? 0] as const,
    ).toSorted((left, right) => left[0].localeCompare(right[0]));
    expect(ours).toEqual(
      LEVELS.map(([id, level]) => [id, level] as const).toSorted((left, right) =>
        left[0].localeCompare(right[0]),
      ),
    );
  });

  it("все они помечены нейтралами: в городе их не купить", () => {
    expect(NEUTRAL_CREATURES.every((creature) => creature.neutral === true)).toBe(true);
    expect(CONTENT.creatures.filter((creature) => creature.neutral === true)).toEqual([]);
  });

  it("нейтрал в охраннике начинает бой, а не ломает карту", () => {
    for (const creature of NEUTRAL_CREATURES) {
      const moved = applyCommand(game(creature.id), {
        type: "moveHero",
        player: 0,
        heroId: "A",
        path: ["E", "E"],
      });
      if (!moved.ok) {
        throw new Error(`нейтрал «${creature.id}»: отказ ${moved.code}`);
      }
      expect(moved.state.battle).not.toBeNull();
    }
  });

  it("у каждого нейтрала есть цена и прирост: от цены считается сила охранника", () => {
    const noPrice = NEUTRAL_CREATURES.filter(
      (creature: CreatureDefinition) => creature.price <= 0 || creature.growth <= 0,
    );
    expect(noPrice).toEqual([]);
  });
});
