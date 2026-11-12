// Свойства из разделов «Свойства, верные всегда» спецификаций 30, 31 и 32:
// проверяются на случайных партиях. Случайность — от генератора ядра с сидом,
// поэтому тест при каждом запуске одинаков.
import { describe, expect, it } from "vitest";
import { playBattleOut } from "./battleAuto.ts";
import { applyCommand } from "./commands.ts";
import { createRng, nextInt } from "./rng.ts";
import type { RngState } from "./rng.ts";
import { BUILDINGS, CREATURES, gameWith } from "./testkit.ts";
import { DIRECTIONS } from "./types.ts";
import type { ArmyStack, Command, GameState } from "./types.ts";

const GAMES = 60;
const COMMANDS = 150;
const ROWS = ["S.......", ...Array.from({ length: 7 }, () => "........")];

function start(seed: number): GameState {
  return gameWith(
    ROWS,
    [
      { type: "town", x: 1, y: 1, owner: 0, buildings: ["tavern", "fort", "militia-yard"] },
      { type: "guard", x: 5, y: 5, creature: "militia", count: 40 },
      { type: "guard", x: 6, y: 1, creature: "falcon", count: 3 },
      { type: "mine", x: 3, y: 6, kind: "gold-mine" },
      { type: "pile", x: 3, y: 0, resource: "wood", amount: 10 },
    ],
    { seed, resources: { gold: 6000, wood: 20, ore: 20 } },
  );
}

/** Случайная команда: чаще осмысленная, но бывают и заведомо неверные. */
function randomCommand(rng: RngState): { command: Command; rng: RngState } {
  let next = rng;
  const roll = (min: number, max: number) => {
    const rolled = nextInt(next, min, max);
    next = rolled.rng;
    return rolled.value;
  };
  const base = { player: 0, townId: "o1" };
  const creature = CREATURES[roll(0, CREATURES.length - 1)]?.id ?? "";
  const kind = roll(0, 9);
  let command: Command;
  if (kind <= 1) {
    command = { type: "endTurn", player: 0 };
  } else if (kind <= 4) {
    const path = Array.from({ length: roll(1, 3) }, () => DIRECTIONS[roll(0, 7)] ?? "N");
    command = { type: "moveHero", player: 0, heroId: "A", path };
  } else if (kind === 5) {
    command = { type: "build", ...base, building: BUILDINGS[roll(0, 9)]?.id ?? "" };
  } else if (kind === 6) {
    command = { type: "recruit", ...base, creature, count: roll(0, 16) };
  } else if (kind <= 8) {
    const from = roll(0, 1) === 0 ? "hero" : "garrison";
    command = { type: "transfer", ...base, from, creature, count: roll(0, 12) };
  } else {
    command = { type: "hireHero", ...base, offer: roll(0, 2) };
  }
  return { command, rng: next };
}

function soundArmy(army: readonly ArmyStack[]): boolean {
  const kinds = new Set(army.map((stack) => stack.creature));
  return kinds.size === army.length && army.every((stack) => stack.count >= 1);
}

/** Что в состоянии неверно; пусто — всё по спецификациям. */
function problems(state: GameState): string[] {
  const found: string[] = [];
  const town = state.objects.find((object) => object.type === "town");
  const hero = state.heroes[0];
  const { resources, tavern = [] } = state.players[0] ?? {};
  if (resources === undefined || Math.min(resources.gold, resources.wood, resources.ore) < 0) {
    found.push("ресурсы отрицательны");
  }
  if (town === undefined) {
    return [...found, "город пропал"];
  }
  if (new Set(town.buildings).size !== town.buildings.length) {
    found.push("здание построено дважды");
  }
  for (const id of town.buildings) {
    const building = state.buildings.find((candidate) => candidate.id === id);
    if (building?.requires.some((required) => !town.buildings.includes(required)) !== false) {
      found.push(`у здания ${id} нет нужного`);
    }
  }
  if (!soundArmy(town.garrison) || !soundArmy(town.available)) {
    found.push("в городе отряд меньше 1 или два отряда одного вида");
  }
  if (state.heroes.length > 1 || (hero !== undefined && !soundArmy(hero.army))) {
    found.push("героев больше одного или армия героя неверна");
  }
  if (hero?.army.length === 0) {
    found.push("герой без армии");
  }
  if (state.outcome !== null) {
    found.push("поражение при живом городе");
  }
  const kinds = tavern.map((offer) => offer.kind);
  if (kinds.length !== 2 || kinds[0] === kinds[1] || kinds.includes(hero?.kind ?? "")) {
    found.push("в таверне не два разных героя или там герой игрока");
  }
  return found;
}

/** Всего существ каждого вида у героя и в гарнизоне. */
function headcount(state: GameState): Map<string, number> {
  const town = state.objects.find((object) => object.type === "town");
  const total = new Map<string, number>();
  const stacks = [
    ...(state.heroes[0]?.army ?? []),
    ...(town?.type === "town" ? town.garrison : []),
  ];
  for (const stack of stacks) {
    total.set(stack.creature, (total.get(stack.creature) ?? 0) + stack.count);
  }
  return total;
}

/** Одна и та же партия: сид и команды заданы. */
function play(): GameState {
  let state = start(7);
  let rng = createRng(1007);
  for (let index = 0; index < COMMANDS; index += 1) {
    const rolled = randomCommand(rng);
    rng = rolled.rng;
    const result = applyCommand(state, rolled.command);
    const next = result.ok ? result.state : state;
    state = next.battle === null ? next : playBattleOut(next).state;
  }
  return state;
}

/** Тот же счёт одной строкой; порядок видов не важен. */
function headcountText(state: GameState): string {
  return JSON.stringify([...headcount(state)].toSorted(([a], [b]) => a.localeCompare(b)));
}

describe("случайные партии с городом", () => {
  it("свойства города, найма и таверны держатся после каждой команды", () => {
    const seen = new Set<string>();
    const failures: string[] = [];
    for (let seed = 1; seed <= GAMES; seed += 1) {
      let state = start(seed);
      let rng = createRng(seed + 1000);
      for (let index = 0; index < COMMANDS; index += 1) {
        const rolled = randomCommand(rng);
        rng = rolled.rng;
        const { command } = rolled;
        const result = applyCommand(state, command);
        if (!result.ok) {
          // Отклонённая команда ничего не меняет — состояние то же самое.
          continue;
        }
        const before = state;
        // Бой доигрывает простой компьютер: команды города во время боя всё равно отклоняются.
        state = result.state.battle === null ? result.state : playBattleOut(result.state).state;
        seen.add(command.type);
        const context = `сид ${seed}, команда ${index}: ${JSON.stringify(command)}`;
        const builtToday = state.day === before.day ? buildingsOf(state) - buildingsOf(before) : 0;
        const moved = command.type === "transfer" && headcountText(state) !== headcountText(before);
        const wrong = [
          ...problems(state),
          ...(builtToday > 1 ? ["за день построено больше одного здания"] : []),
          ...(moved ? ["при обмене существа появились или пропали"] : []),
        ];
        failures.push(...wrong.map((problem) => `${context}: ${problem}`));
      }
    }
    expect(failures).toEqual([]);
    // Каждая команда хоть раз была принята — иначе тест ничего не проверяет.
    expect([...seen].toSorted()).toEqual([
      "build",
      "endTurn",
      "hireHero",
      "moveHero",
      "recruit",
      "transfer",
    ]);
  }, 60_000);

  it("повтор тех же команд с тем же сидом даёт то же состояние", () => {
    expect(play()).toEqual(play());
  });
});

function buildingsOf(state: GameState): number {
  const town = state.objects.find((object) => object.type === "town");
  return town?.type === "town" ? town.buildings.length : 0;
}
