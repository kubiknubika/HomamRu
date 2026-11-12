// Правила из docs/mechanics/42-opponent.md: что компьютер делает в городе и куда идёт герой.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { army, duel, end, enemyTown, HOME, put, run, untilTurnOf, withoutHero } from "./duelKit.ts";
import { chooseMapCommand, computerCommand } from "./opponent.ts";
import { OPPONENT } from "./testkit.ts";
import type { ArmyStack, Command, GameState, MapObjectDefinition } from "./types.ts";

/** Партия, где герой A (100 ополченцев, цена 6000) один: чужого героя на карте нет. */
function alone(objects: MapObjectDefinition[], mine?: ArmyStack[]): GameState {
  return withoutHero(duel(objects, mine), "B");
}

/** Ход компьютера за игрока, чей сейчас ход: команды городов и куда пошёл герой. */
function turn(initial: GameState): { town: string[]; hero: string } {
  let state = initial;
  const town: string[] = [];
  for (let count = 0; count < 50; count += 1) {
    const command = chooseMapCommand(state);
    if (command.type === "moveHero" || command.type === "endTurn") {
      return { town, hero: command.type === "moveHero" ? command.path.join(",") : "стоит" };
    }
    town.push(short(command));
    state = run(state, command);
  }
  return { town, hero: "ход не кончился" };
}

const heroGoes = (state: GameState): string => turn(state).hero;

function withResources(state: GameState, gold: number, wood: number, ore: number): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, resources: { gold, wood, ore } })),
  };
}

function short(command: Command): string {
  switch (command.type) {
    case "moveHero":
      return `move ${command.path.join(",")}`;
    case "build":
      return `build ${command.townId} ${command.building}`;
    case "recruit":
      return `recruit ${command.townId} ${command.creature} ${command.count}`;
    case "transfer":
      return `transfer ${command.townId} ${command.creature} ${command.count}`;
    case "hireHero":
      return `hire ${command.townId} ${command.offer}`;
    default:
      return command.type;
  }
}

const guard = (x: number, y: number, creature: string, count: number): MapObjectDefinition => ({
  type: "guard",
  x,
  y,
  creature,
  count,
});

describe("город компьютера", () => {
  it("строит следующее здание по списку, нанимает на остаток, золото на стройку не тратит", () => {
    // 3300 золота: ратуша 2500; следующее — стрельбище (1000, но дерева нет): из 800 отложено
    // 1000 — нанимать не на что.
    expect(turn(withResources(alone([HOME]), 3300, 0, 0)).town).toEqual(["build o1 town-hall"]);
    // 3800: после ратуши 1300, сверх отложенной 1000 — 300: пять ополченцев по 60.
    expect(turn(withResources(alone([HOME]), 3800, 0, 0)).town).toEqual([
      "build o1 town-hall",
      "recruit o1 militia 5",
    ]);
  });

  it("нанимает начиная с самых дорогих", () => {
    const town = { ...HOME, buildings: [...OPPONENT.buildOrder] } as MapObjectDefinition;
    const { town: commands } = turn(withResources(alone([town]), 100_000, 0, 0));
    expect(commands.map((line) => line.split(" ")[2])).toEqual([
      "armsman",
      "falcon",
      "slinger",
      "militia",
    ]);
  });

  it("здание, для которого нет нужной постройки, список не задерживает", () => {
    const town = { ...HOME, buildings: ["tavern", "town-hall"] } as MapObjectDefinition;
    // Двору нужен форт, стрельбищу — двор: первой строится кузница, которой ничего не нужно.
    expect(turn(withResources(alone([town]), 20_000, 50, 50)).town[0]).toBe("build o1 smithy");
  });

  it("герой в городе забирает гарнизон целиком", () => {
    const town = { ...HOME, garrison: army("slinger:4", "falcon:2") } as MapObjectDefinition;
    const state = withResources(put(alone([town]), "A", 0, 4), 0, 0, 0);
    expect(turn(state).town).toEqual(["transfer o1 slinger 4", "transfer o1 falcon 2"]);
  });

  it("героя нет — нанимает первого из таверны; не хватает золота — копит и ничего не тратит", () => {
    const state = withoutHero(alone([HOME]), "A");
    expect(turn(state).town[0]).toBe("hire o1 0");
    expect(turn(withResources(state, 2400, 0, 0))).toEqual({ town: [], hero: "стоит" });
  });
});

describe("куда идёт герой компьютера", () => {
  const pile: MapObjectDefinition = { type: "pile", x: 3, y: 3, resource: "gold", amount: 100 };
  const mine: MapObjectDefinition = { type: "mine", x: 0, y: 2, kind: "sawmill" };

  it("без боя: ближайшее из кучек, не своих шахт и пустых чужих городов", () => {
    expect(heroGoes(alone([pile, mine]))).toBe("S,S");
    expect(heroGoes(alone([pile]))).toBe("SE,SE,SE");
    expect(heroGoes(alone([enemyTown()]))).toBe("SE,SE,SE,SE");
  });

  it("своя шахта — не цель", () => {
    const state = run(alone([mine]), {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["S", "S"],
    });
    expect(heroGoes(state)).toBe("стоит");
  });

  it("шахта в зоне охранника без боя не берётся", () => {
    // 100 ополченцев (6000) против 50 латников (15 000): перевеса нет, идти некуда.
    expect(heroGoes(alone([mine, guard(0, 3, "armsman", 50)]))).toBe("стоит");
    const guarded: MapObjectDefinition = { type: "pile", x: 1, y: 3, resource: "ore" };
    expect(heroGoes(alone([guarded, guard(0, 3, "armsman", 50)]))).toBe("стоит");
  });

  it("нападает только с перевесом в полтора раза", () => {
    // Армия героя стоит 6000. 13 латников — 3900 × 1,5 = 5850: можно; 14 — 4200 × 1,5 = 6300: нельзя.
    expect(heroGoes(alone([guard(0, 6, "armsman", 13)]))).toBe("S,S,S,S,S");
    expect(heroGoes(alone([guard(0, 6, "armsman", 14)]))).toBe("стоит");
  });

  it("из целей по силам выбирает самую слабую, при равной силе — ближайшую", () => {
    const near = guard(0, 3, "slinger", 30);
    expect(heroGoes(alone([near, guard(6, 6, "militia", 10)]))).toBe("SE,SE,SE,SE,SE");
    expect(heroGoes(alone([near, guard(6, 6, "slinger", 30)]))).toBe("S,S");
  });

  it("нападает на чужого героя и на город с гарнизоном, если хватает перевеса", () => {
    const state = duel([enemyTown(army("militia:40"))]);
    // Герой B (600) слабее гарнизона (2400): сначала он.
    expect(heroGoes(state)).toBe("E,E,E,E");
    expect(heroGoes(withoutHero(state, "B"))).toBe("SE,SE,SE,SE");
    expect(heroGoes(withoutHero(duel([enemyTown(army("militia:70"))]), "B"))).toBe("стоит");
  });

  it("герой в своём городе считается вместе с гарнизоном", () => {
    // 10 ополченцев героя и 60 в гарнизоне — 4200 × 1,5 = 6300: перевеса у 100 ополченцев нет.
    expect(heroGoes(put(duel([enemyTown(army("militia:60"))]), "B", 4, 4))).toBe("стоит");
    expect(heroGoes(put(duel([enemyTown(army("militia:50"))]), "B", 4, 4))).toBe("SE,SE,SE,SE");
  });

  it("за пополнением: некого бить — идёт в свой город и ждёт там", () => {
    const state = withResources(alone([HOME, guard(6, 6, "armsman", 50)]), 0, 0, 0);
    expect(heroGoes(state)).toBe("S,S,S,S");
    expect(heroGoes(put(state, "A", 0, 4))).toBe("стоит");
  });
});

const defended = (count: number): MapObjectDefinition =>
  ({
    ...HOME,
    x: 2,
    y: 2,
    garrison: count > 0 ? army(`militia:${count}`) : [],
  }) as MapObjectDefinition;

describe("оборона города", () => {
  const far: MapObjectDefinition = { type: "pile", x: 0, y: 7, resource: "gold", amount: 100 };
  it("враг близко, герой с гарнизоном сильнее, но перевеса нет — идёт в город и стоит", () => {
    // 100 + 60 ополченцев (9600) против 150 (9000).
    const state = withResources(duel([defended(60), far], undefined, army("militia:150")), 0, 0, 0);
    expect(heroGoes(state)).toBe("SE,SE");
    // В городе герой забирает гарнизон: теперь 160 против 150 — перевеса всё равно нет, стоит.
    expect(turn(put(state, "A", 2, 2))).toEqual({
      town: ["transfer o1 militia 60"],
      hero: "стоит",
    });
  });

  it("врага можно победить с перевесом — идёт на него, а не за кучкой", () => {
    expect(heroGoes(withResources(duel([defended(0), far]), 0, 0, 0))).toBe("E,E,E,E");
  });

  it("враг сильнее героя с гарнизоном — город не обороняет, занимается своим", () => {
    const state = duel([defended(0), far], undefined, army("militia:200"));
    expect(heroGoes(withResources(state, 0, 0, 0))).toBe("S,S,S,S,S,S,S");
  });
});

describe("чей ход — компьютера или человека", () => {
  it("на карте: за человека команды нет, за компьютер — есть; после конца партии — нет", () => {
    const state = duel([HOME, enemyTown()]);
    expect(computerCommand(state)).toBeUndefined();
    const theirs = run(state, end(0));
    expect(computerCommand(theirs)).toEqual(chooseMapCommand(theirs));
    expect(computerCommand({ ...theirs, outcome: "victory", winner: 0 })).toBeUndefined();
  });

  it("в бою: за охранника и за героя компьютера ходит компьютер, за человека — нет", () => {
    const attacked = run(duel([HOME, enemyTown()]), {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["E", "E", "E", "E"],
    });
    expect(computerCommand(untilTurnOf(attacked, 0))).toBeUndefined();
    expect(computerCommand(untilTurnOf(attacked, 1))).toBeDefined();
    // Напал компьютер: человек обороняется сам.
    const theirs = run(duel([HOME, enemyTown()], army("militia:5"), army("militia:100")), end(0));
    const defending = run(theirs, {
      type: "moveHero",
      player: 1,
      heroId: "B",
      path: ["W", "W", "W", "W"],
    });
    expect(defending.battle).toMatchObject({ heroId: "B", defenderHeroId: "A" });
    expect(computerCommand(untilTurnOf(defending, 0))).toBeDefined();
    expect(computerCommand(untilTurnOf(defending, 1))).toBeUndefined();
  });

  it("бой с охранником на карте человека: за охранника ходит компьютер", () => {
    const state = run(alone([guard(0, 3, "militia", 5)]), {
      type: "moveHero",
      player: 0,
      heroId: "A",
      path: ["S", "S"],
    });
    expect(computerCommand(untilTurnOf(state, 1))).toBeDefined();
    expect(computerCommand(untilTurnOf(state, 0))).toBeUndefined();
  });

  it("каждая выбранная команда принимается", () => {
    let state = run(duel([HOME, enemyTown()]), end(0));
    for (let count = 0; count < 30 && state.battle === null; count += 1) {
      const result = applyCommand(state, chooseMapCommand(state));
      expect(result.ok).toBe(true);
      state = result.ok ? result.state : state;
    }
  });
});
