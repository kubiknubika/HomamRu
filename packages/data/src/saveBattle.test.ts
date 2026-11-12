// Параметры шага 3.2 в сохранении: docs/mechanics/04-save.md и 23-map-battle.md.
import { applyCommand, createGame, playBattleOut, replay } from "@homamru/core";
import type { Command, GameState } from "@homamru/core";
import { BUILDINGS, CREATURES } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import { encodeSave, verifySave } from "./save.ts";
import {
  decodeTestSave as decodeSave,
  FULL_STATE as FULL,
  readTestState as readState,
  TEST_DEFAULTS,
  withChecksumOf,
} from "./testkit.ts";

const TO_ZONE: Command = { type: "moveHero", player: 0, heroId: "A", path: ["E", "E"] };

/** Партия: герой в (1, 1), охранник в (4, 1). */
function newGame(army: { creature: string; count: number }[], guardCount: number): GameState {
  const created = createGame(
    {
      id: "t",
      name: "Проверочная",
      terrain: Array.from({ length: 8 }, () => "........"),
      players: [{ hero: { x: 1, y: 1, attack: 1, army } }],
      objects: [{ type: "guard", x: 4, y: 1, creature: "militia", count: guardCount }],
    },
    11,
    CREATURES,
    BUILDINGS,
  );
  if (!created.ok) {
    throw new Error("партия не создана");
  }
  return created.state;
}

function apply(state: GameState, command: Command): GameState {
  const result = applyCommand(state, command);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.state;
}

describe("сохранение посреди боя", () => {
  const initial = newGame(
    [
      { creature: "militia", count: 12 },
      { creature: "slinger", count: 6 },
    ],
    14,
  );
  const entered = apply(initial, TO_ZONE);
  const all = playBattleOut(entered);
  // Сохраняем после каждой команды боя и продолжаем с загруженного.
  it("после любой команды боя запись загружается без изменений и бой доигрывается так же", () => {
    expect(all.commands.length).toBeGreaterThan(5);
    let state = entered;
    for (const [index, command] of all.commands.entries()) {
      const commands = [TO_ZONE, ...all.commands.slice(0, index)];
      const body = { gameVersion: "test", initial, commands, state };
      expect(verifySave(body)).toBe(true);
      const loaded = decodeSave(encodeSave(body, index));
      expect(loaded).toEqual({ kind: "ok", record: { ...body, seq: index, adapted: false } });
      const record = loaded.kind === "ok" ? loaded.record : undefined;
      // Остаток команд, применённый к загруженному состоянию, приводит к тому же концу.
      const rest = replay(record?.state ?? state, all.commands.slice(index));
      expect(rest.ok ? rest.state : null).toEqual(all.state);
      state = apply(state, command);
    }
    expect(state).toEqual(all.state);
  });

  it("запись после поражения загружается: героя нет, партия окончена", () => {
    const lost = playBattleOut(apply(newGame([{ creature: "militia", count: 2 }], 300), TO_ZONE));
    expect(lost.state.outcome).toBe("defeat");
    expect(readState(lost.state)).toEqual(lost.state);
    expect(readState(lost.state)?.heroes).toEqual([]);
  });
});

describe("параметры шага 3.2: чего нет — начальное, чего игра не знает — убирается", () => {
  it("сохранение шага 3.1 (вторая версия состояния) загружается", () => {
    // Так выглядело состояние до шага 3.2: у героя нет армии, нет существ, боя и итога.
    const old = {
      version: 2,
      rng: FULL.rng,
      map: FULL.map,
      players: FULL.players,
      heroes: [{ id: "A", owner: 0, x: 0, y: 0, movement: 359 }],
      objects: FULL.objects.slice(0, 2),
      day: 9,
      currentPlayer: 1,
    };
    const text = withChecksumOf(
      JSON.stringify({
        format: 1,
        stateVersion: 2,
        seq: 4,
        gameVersion: "0.2.0",
        initial: old,
        commands: [],
        state: old,
      }),
    );
    const state = {
      ...old,
      version: 4,
      heroes: [
        {
          ...old.heroes[0],
          attack: 0,
          defense: 0,
          army: [{ creature: "militia", count: 10 }],
          experience: 0,
          level: 1,
        },
      ],
      creatures: CREATURES,
      buildings: BUILDINGS,
      battle: null,
      outcome: null,
    };
    expect(decodeSave(text)).toEqual({
      kind: "ok",
      record: { seq: 4, gameVersion: "0.2.0", initial: state, commands: [], state, adapted: true },
    });
  });

  it("армия: отряды незнакомых существ убираются; не осталось ни одного — начальная армия", () => {
    const [hero, other] = FULL.heroes;
    const dragons = { creature: "dragon", count: 2 };
    const state = readState({
      ...FULL,
      heroes: [
        { ...hero, army: [dragons, { creature: "falcon", count: 4 }, { creature: "militia" }] },
        { ...other, army: [dragons] },
      ],
    });
    expect(state?.heroes.map((item) => item.army)).toEqual([
      [{ creature: "falcon", count: 4 }],
      TEST_DEFAULTS.heroArmy,
    ]);
  });

  it("армия длиннее семи отрядов обрезается до семи", () => {
    const army = Array.from({ length: 9 }, (_, index) => ({
      creature: "militia",
      count: index + 1,
    }));
    const state = readState({ ...FULL, heroes: [{ ...FULL.heroes[0], army }] });
    expect(state?.heroes[0]?.army).toEqual(army.slice(0, 7));
  });

  it("уровень считается по опыту; нечитаемые атака, защита и опыт — начальные", () => {
    const [hero] = FULL.heroes;
    const state = readState({
      ...FULL,
      heroes: [
        { ...hero, experience: 3200, level: 1 },
        { ...hero, id: "B", owner: 1, attack: -1, defense: "много", experience: 1.5, level: 40 },
      ],
    });
    expect(state?.heroes).toMatchObject([
      { experience: 3200, level: 4 },
      { attack: 0, defense: 0, experience: 0, level: 1 },
    ]);
  });

  it("охранник из незнакомых существ или с числом вне 1–4000 убирается", () => {
    const [, , guard] = FULL.objects;
    const state = readState({
      ...FULL,
      objects: [
        { ...guard, id: "o5", x: 2, y: 2, creature: "dragon" },
        { ...guard, id: "o6", x: 2, y: 3, count: 0 },
        { ...guard, id: "o7", x: 1, y: 3, count: 4001 },
        guard,
      ],
    });
    expect(state?.objects).toEqual([guard]);
  });

  it("сила охранника, не сходящаяся с числом существ, заменяется числом × 1000", () => {
    const [, , guard] = FULL.objects;
    for (const power of [undefined, 5, 11_999, 13_000, "сила"]) {
      const state = readState({ ...FULL, objects: [{ ...guard, power }] });
      expect(state?.objects).toEqual([{ ...guard, power: 12_000 }]);
    }
    expect(readState({ ...FULL, objects: [{ ...guard, power: 12_999 }] })?.objects).toEqual([
      { ...guard, power: 12_999 },
    ]);
  });

  it("существа: записанные остаются как записаны, недостающие берутся из игры", () => {
    const [militia] = CREATURES;
    const changed = { ...militia, health: 99, wings: "нет" };
    const inverted = { ...militia, id: "odd", damageMin: 9, damageMax: 1 };
    const state = readState({ ...FULL, creatures: [changed, "существо", { id: "x" }, inverted] });
    // Свойства существа в партии — те, с которыми она началась; незнакомое поле убрано.
    expect(state?.creatures).toEqual([{ ...militia, health: 99 }, ...CREATURES.slice(1)]);
  });

  it("бой, который не читается или относится к пропавшему охраннику, убирается", () => {
    const entered = apply(newGame([{ creature: "militia", count: 12 }], 14), TO_ZONE);
    expect(readState(entered)?.battle).toEqual(entered.battle);
    const broken = { ...entered.battle, state: { ...entered.battle?.state, round: "третий" } };
    expect(readState({ ...entered, battle: broken })?.battle).toBeNull();
    expect(readState({ ...entered, battle: { ...entered.battle, spell: 1 } })?.battle).toBeNull();
    expect(readState({ ...entered, objects: [] })?.battle).toBeNull();
    expect(
      readState({ ...entered, heroes: [{ ...entered.heroes[0], id: "Z" }] })?.battle,
    ).toBeNull();
    // Армия героя или число охранника разошлись с боем — конец боя на карту не перенести.
    const [hero] = entered.heroes;
    const thinner = { ...hero, army: [{ creature: "militia", count: 11 }] };
    expect(readState({ ...entered, heroes: [thinner] })?.battle).toBeNull();
    const [guard] = entered.objects;
    expect(
      readState({ ...entered, objects: [{ ...guard, count: 15, power: 15_000 }] })?.battle,
    ).toBeNull();
    // Без боя партия продолжается с карты: герой стоит в зоне охранника и может ходить.
    const state = readState({ ...entered, battle: 5 });
    expect(
      state === null ? null : applyCommand(state, { type: "endTurn", player: 0 }),
    ).toMatchObject({ ok: true });
  });

  it("итог партии: нечитаемое значение — партия идёт", () => {
    expect(readState({ ...FULL, outcome: "victory" })?.outcome).toBeNull();
    expect(readState({ ...FULL, outcome: "defeat" })?.outcome).toBe("defeat");
  });
});
