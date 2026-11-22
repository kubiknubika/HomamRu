// Запись до версии 11 (docs/mechanics/66-rare-resources.md, 04-save.md): редких ресурсов нет,
// у заклинаний кругов 2–4 вес в гильдии нулевой, в наборе города — только первый круг.
import { STATE_VERSION } from "@homamru/core";
import { SPELLS } from "@homamru/core/testkit";
import { describe, expect, it } from "vitest";
import { defaultGuild, readSpells } from "./spells.ts";
import { FULL_STATE, readTestState } from "./testkit.ts";

const FIRST = ["magic-arrow", "shield", "dispel", "cure", "bless"];
/** Заклинания игры: первый круг и по копии каждого во втором, с тем же весом. */
const second = SPELLS.map((spell) => ({ ...spell, id: `${spell.id}-2`, level: 2 }));
const OURS = [...SPELLS, ...second];

describe("запись версии 10 читается новой версией", () => {
  it("редких ресурсов в записи нет — у игрока их ноль, остальные целы", () => {
    const old = {
      ...FULL_STATE,
      version: 10,
      players: FULL_STATE.players.map((player) => ({
        ...player,
        resources: { gold: 700, wood: 3, ore: 2 },
      })),
    };
    expect(readTestState(old)?.players[0]?.resources).toEqual({
      gold: 700,
      wood: 3,
      ore: 2,
      mercury: 0,
      sulfur: 0,
      crystal: 0,
      gems: 0,
    });
  });

  it("нулевой вес заклинания из записи заменяется весом из игры; ненулевой остаётся", () => {
    const saved = [
      ...SPELLS.map((spell) => ({ ...spell, chance: spell.chance + 1 })),
      ...second.map((spell) => ({ ...spell, chance: 0 })),
    ];
    const read = readSpells(saved, OURS);
    expect(read.slice(0, SPELLS.length).map((spell) => spell.chance)).toEqual(
      SPELLS.map((spell) => spell.chance + 1),
    );
    expect(read.slice(SPELLS.length)).toEqual(second);
  });

  it("круг, которого в наборе города нет, набирается без жребия; записанный не меняется", () => {
    const kept = ["slow", "haste"];
    const guild = defaultGuild(OURS, kept);
    expect(guild.slice(0, 2)).toEqual(kept);
    expect(guild.slice(2)).toEqual(FIRST.slice(0, 4).map((id) => `${id}-2`));
    // Того же правила — два чтения дают одно и то же.
    expect(defaultGuild(OURS, kept)).toEqual(guild);
    expect(defaultGuild(OURS, guild)).toEqual(guild);
  });
});

describe("запись версии 11 читается версией 12 (72-market.md)", () => {
  it("версия записи — 13", () => {
    expect(STATE_VERSION).toBe(14);
  });

  it("рынка в списке зданий записи нет — он дописывается; в городах его нет", () => {
    const old = {
      ...FULL_STATE,
      version: 11,
      buildings: FULL_STATE.buildings.filter((building) => building.market !== true),
    };
    const read = readTestState(old);
    expect(read?.buildings.filter((building) => building.market === true)).toHaveLength(1);
    const towns = read?.objects.filter((object) => object.type === "town") ?? [];
    expect(towns.some((town) => town.buildings.includes("market"))).toBe(false);
  });
});

describe("запись версии 12 читается версией 13 (73-map-spells.md)", () => {
  it("отметок «Видений» и «Маскировки» в записи нет — не действуют", () => {
    const old = {
      ...FULL_STATE,
      version: 12,
      heroes: FULL_STATE.heroes.map(({ visions: _visions, disguise: _disguise, ...hero }) => hero),
    };
    const read = readTestState(old);
    expect(read?.heroes.map((hero) => [hero.visions, hero.disguise])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it("отметки из записи целы; негодные — ноль", () => {
    const heroes = FULL_STATE.heroes.map((hero, index) =>
      index === 0 ? { ...hero, visions: 2, disguise: 3 } : { ...hero, visions: 7, disguise: -1 },
    );
    const read = readTestState({ ...FULL_STATE, heroes });
    expect(read?.heroes.map((hero) => [hero.visions, hero.disguise])).toEqual([
      [2, 3],
      [0, 0],
    ]);
  });
});
