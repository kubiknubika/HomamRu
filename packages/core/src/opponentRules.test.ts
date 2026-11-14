// Два правила компьютера на карте, добавленные на шаге 7.2 (42-opponent.md): «враг рядом» и «за гарнизоном».
import { describe, expect, it } from "vitest";
import { army, duel, HOME, put, withoutHero } from "./duelKit.ts";
import { chooseMapCommand } from "./opponent.ts";
import type { GameState, MapObjectDefinition } from "./types.ts";

/** Куда герой A (100 ополченцев, 6000) идёт первой командой хода; города молчат — золота нет. */
function heroGoes(initial: GameState): string {
  const state = {
    ...initial,
    players: initial.players.map((player) => ({
      ...player,
      resources: { gold: 0, wood: 0, ore: 0 },
    })),
  };
  const command = chooseMapCommand(state);
  return command.type === "moveHero" ? command.path.join(",") : command.type;
}

const PILE: MapObjectDefinition = { type: "pile", x: 0, y: 1, resource: "gold", amount: 100 };
const withGarrison = (count: number): MapObjectDefinition =>
  ({ ...HOME, garrison: army(`militia:${count}`) }) as MapObjectDefinition;

describe("враг рядом", () => {
  it("чужой герой по силам и в дне пути — сначала он, кучка подождёт", () => {
    // Герой B (10 ополченцев) в четырёх клетках к востоку, кучка — в одной к югу.
    expect(heroGoes(duel([PILE]))).toBe("E,E,E,E");
  });

  it("перевеса в полтора раза нет — кучка, как раньше", () => {
    // 67 ополченцев: 4020 × 1,5 = 6030 — больше 6000.
    expect(heroGoes(duel([PILE], undefined, army("militia:67")))).toBe("S");
    expect(heroGoes(duel([PILE], undefined, army("militia:66")))).toBe("E,E,E,E");
  });
});

describe("за гарнизоном", () => {
  it("гарнизон своего города не меньше 60 % армии героя — герой идёт за ним, кучка подождёт", () => {
    const far: MapObjectDefinition = { ...PILE, x: 2, y: 0 };
    expect(heroGoes(withoutHero(duel([withGarrison(60), far]), "B"))).toBe("S,S,S,S");
    expect(heroGoes(withoutHero(duel([withGarrison(59), far]), "B"))).toBe("E,E");
  });

  it("герой уже в городе — забирает гарнизон, а не идёт за ним", () => {
    const state = put(withoutHero(duel([withGarrison(60), PILE]), "B"), "A", 0, 4);
    expect(heroGoes(state)).toBe("transfer");
  });

  it("оборона важнее: враг у города, перевеса нет — герой идёт в город", () => {
    const town = { ...withGarrison(60), x: 2, y: 2 } as MapObjectDefinition;
    expect(heroGoes(duel([town, PILE], undefined, army("militia:150")))).toBe("SE,SE");
  });
});
