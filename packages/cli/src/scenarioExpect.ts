/** Сверка конца сценария карты с ожиданиями из файла. Описание: docs/mechanics/05-diagnostics.md. */
import type { GameState, HeroState, ObjectState } from "@homamru/core";
import type { Scenario } from "@homamru/data";

type Expected = NonNullable<Scenario["expect"]>;
type HeroWant = Exclude<NonNullable<Expected["heroes"]>[string], "absent">;
type ObjectWant = NonNullable<Expected["objects"]>[string];

function armyText(army: readonly { creature: string; count: number }[]): string {
  return army.map((stack) => `${stack.creature} ${stack.count}`).join(", ") || "пусто";
}

function checkHero(hero: HeroState, want: HeroWant): string[] {
  const failures: string[] = [];
  // Клетка сверяется целиком; не названная координата считается совпавшей.
  const x = want.x ?? hero.x;
  const y = want.y ?? hero.y;
  if (x !== hero.x || y !== hero.y) {
    failures.push(
      `Герой ${hero.id}: ожидалась клетка (${x}, ${y}), получена (${hero.x}, ${hero.y}).`,
    );
  }
  const numbers = [
    ["ожидался запас хода", want.movement, hero.movement],
    ["ожидался опыт", want.experience, hero.experience],
    ["ожидался уровень", want.level, hero.level],
    ["ожидалась сумма атаки и защиты", want.skills, hero.attack + hero.defense],
  ] as const;
  for (const [name, wanted, got] of numbers) {
    if (wanted !== undefined && wanted !== got) {
      failures.push(`Герой ${hero.id}: ${name} ${wanted}, получен ${got}.`);
    }
  }
  if (want.kind !== undefined && want.kind !== hero.kind) {
    failures.push(`Герой ${hero.id}: ожидался герой ${want.kind}, получен ${hero.kind}.`);
  }
  if (want.army !== undefined && armyText(want.army) !== armyText(hero.army)) {
    failures.push(
      `Герой ${hero.id}: ожидалась армия ${armyText(want.army)}, получена ${armyText(hero.army)}.`,
    );
  }
  return failures;
}

function checkTown(
  id: string,
  object: ObjectState | undefined,
  want: Exclude<ObjectWant, "absent" | { owner: unknown } | { count: unknown }>,
): string[] {
  if (object?.type !== "town") {
    return [`Объект ${id}: ожидался город, но его нет.`];
  }
  const failures: string[] = [];
  const built = object.buildings.join(", ") || "пусто";
  if (want.buildings !== undefined && (want.buildings.join(", ") || "пусто") !== built) {
    failures.push(`Город ${id}: ожидались здания ${want.buildings.join(", ")}, получены ${built}.`);
  }
  const armies = [
    ["ждут найма", want.available, object.available],
    ["гарнизон", want.garrison, object.garrison],
  ] as const;
  for (const [name, wanted, got] of armies) {
    if (wanted !== undefined && armyText(wanted) !== armyText(got)) {
      failures.push(
        `Город ${id}: ${name} — ожидалось ${armyText(wanted)}, получено ${armyText(got)}.`,
      );
    }
  }
  return failures;
}

function checkObject(id: string, object: ObjectState | undefined, want: ObjectWant): string[] {
  if (want === "absent") {
    return object === undefined ? [] : [`Объект ${id}: ожидалось, что его нет, но он есть.`];
  }
  if ("owner" in want) {
    if (object?.type !== "mine") {
      return [`Объект ${id}: ожидалась шахта, но её нет.`];
    }
    return object.owner === want.owner
      ? []
      : [`Шахта ${id}: ожидался владелец ${want.owner}, получен ${object.owner}.`];
  }
  if (!("count" in want)) {
    return checkTown(id, object, want);
  }
  if (object?.type !== "guard") {
    return [`Объект ${id}: ожидался охранник, но его нет.`];
  }
  return object.count === want.count
    ? []
    : [`Охранник ${id}: ожидалось существ ${want.count}, получено ${object.count}.`];
}

function checkResources(expected: Expected, state: GameState): string[] {
  const failures: string[] = [];
  for (const [index, want] of (expected.resources ?? []).entries()) {
    const have = state.players[index]?.resources;
    for (const [resource, amount] of Object.entries(want)) {
      const got = have?.[resource as keyof typeof want];
      if (got !== amount) {
        failures.push(`Игрок ${index + 1}: ожидалось ${resource} ${amount}, получено ${got}.`);
      }
    }
  }
  return failures;
}

export function checkExpectations(scenario: Scenario, state: GameState): string[] {
  const expected = scenario.expect ?? {};
  const failures: string[] = [];
  if (expected.day !== undefined && expected.day !== state.day) {
    failures.push(`Ожидался день ${expected.day}, получен день ${state.day}.`);
  }
  for (const [heroId, want] of Object.entries(expected.heroes ?? {})) {
    const hero = state.heroes.find((candidate) => candidate.id === heroId);
    if (want === "absent") {
      if (hero !== undefined) {
        failures.push(`Герой ${heroId}: ожидалось, что его нет, но он есть.`);
      }
    } else if (hero === undefined) {
      failures.push(`Ожидался герой ${heroId}, но его нет.`);
    } else {
      failures.push(...checkHero(hero, want));
    }
  }
  failures.push(...checkResources(expected, state));
  for (const [objectId, want] of Object.entries(expected.objects ?? {})) {
    const object = state.objects.find((candidate) => candidate.id === objectId);
    failures.push(...checkObject(objectId, object, want));
  }
  if (expected.battle !== undefined && expected.battle !== (state.battle !== null)) {
    failures.push(
      expected.battle
        ? "Ожидалось, что бой идёт, но боя нет."
        : "Ожидалось, что боя нет, но бой идёт.",
    );
  }
  const outcome = state.outcome ?? "none";
  if (expected.outcome !== undefined && expected.outcome !== outcome) {
    failures.push(`Ожидался итог партии ${expected.outcome}, получен ${outcome}.`);
  }
  return failures;
}
