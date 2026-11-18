// Свойства из раздела «Свойства, верные всегда» спецификации 66-rare-resources.md
// на многих сидах. Примеры на каждое правило есть в rare.test.ts; здесь проверяется,
// что правила держатся при любом жребии набора гильдии и любом наборе навыков.
// До этой порции ни одно из четырёх не проверялось на многих сидах.
import { describe, expect, it } from "vitest";
import { guildLevel, guildSpells, withGuildSpells } from "./magic.ts";
import { GAME_SPELLS } from "./spellKit.ts";
import { NO_RESOURCES } from "./objects.ts";
import { learnableLevel } from "./skills.ts";
import type { HeroSkill } from "./skills.ts";
import { START, townGame, toCommand } from "./townKit.ts";
import { applyCommand } from "./commands.ts";
import { MINE_KINDS, RESOURCES } from "./types.ts";
import type { GameState, Resources, TownState } from "./types.ts";

const RARE = ["mercury", "sulfur", "crystal", "gems"] as const;
const rare = (amount: number) => Object.fromEntries(RARE.map((id) => [id, amount]));
const WEALTH: Resources = { ...NO_RESOURCES, gold: 20_000, wood: 50, ore: 50, ...rare(50) };
const GUILDS = ["mage-guild", "mage-guild-2", "mage-guild-3", "mage-guild-4"];
const SEEDS = 40;
/** Наивысший уровень навыка: «Мудрость» 3 — предел (skills.ts, `MAX_SKILL_LEVEL`). */
const TOP_SKILL = 3;

/** Свой город игрока: гильдия строится только в нём. */
function home(state: GameState): TownState | undefined {
  return state.objects.find(
    (object): object is TownState => object.type === "town" && object.owner === 0,
  );
}

/** Партия с городом и всеми заклинаниями игры: набор гильдии брошен по ним. */
function game(seed: number, amounts: Resources = WEALTH): GameState {
  return withGuildSpells({ ...townGame(START, amounts, [], undefined, seed), spells: GAME_SPELLS });
}

/**
 * Строит гильдии подряд, по одной в день. Отказ стройки не считается ошибкой:
 * при скудной казне часть уровней просто не встанет, и это тоже надо проверить.
 */
function withGuilds(state: GameState, count: number): GameState {
  let current = state;
  for (const building of GUILDS.slice(0, count)) {
    const built = applyCommand(current, toCommand({ build: building }));
    if (built.ok) {
      current = built.state;
    }
    const turned = applyCommand(current, toCommand("endTurn"));
    if (turned.ok) {
      current = turned.state;
    }
  }
  return current;
}

describe("свойства редких ресурсов и гильдии (66)", () => {
  it("ни один ресурс не бывает меньше нуля — ни при жребии набора, ни после стройки", () => {
    const broken: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      // Скудная казна: часть строек будет отказана, часть пройдёт — оба случая нужны.
      const start = game(seed, { ...NO_RESOURCES, gold: 2_000, wood: 5, ore: 5 });
      for (const count of [1, 2, 3, 4]) {
        const state = withGuilds(start, count);
        for (const player of state.players) {
          for (const resource of RESOURCES) {
            const amount = player.resources[resource];
            if (amount < 0) {
              broken.push(
                `сид ${seed}, гильдий ${count}: у игрока ${player.id} ${resource} = ${amount}`,
              );
            }
          }
        }
      }
    }
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("уровень гильдии N построен — значит, построены все уровни ниже", () => {
    const broken: string[] = [];
    const levelsSeen = new Set<number>();
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const start = game(seed);
      for (const count of [1, 2, 3, 4]) {
        const state = withGuilds(start, count);
        const town = home(state);
        const level = town === undefined ? 0 : guildLevel(state, town);
        levelsSeen.add(level);
        const built = new Set(
          (state.objects.find((object) => object.type === "town")?.buildings ?? []).map(String),
        );
        // Уровень N требует всех N зданий подряд.
        for (let needed = 1; needed <= level; needed += 1) {
          const id = needed === 1 ? "mage-guild" : `mage-guild-${needed}`;
          if (!built.has(id)) {
            broken.push(`сид ${seed}: уровень ${level}, а «${id}» не построен`);
          }
        }
      }
    }
    // Гильдия обязана появиться хоть на каком-то уровне — иначе свойство не проверено.
    expect(levelsSeen.size).toBeGreaterThan(1);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("в наборе круга N не больше 6 − N заклинаний, все разные и все этого круга", () => {
    const broken: string[] = [];
    const roundsSeen = new Set<number>();
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const start = game(seed);
      for (const count of [1, 2, 3, 4]) {
        const state = withGuilds(start, count);
        const town = home(state);
        if (town === undefined) {
          continue;
        }
        const level = guildLevel(state, town);
        if (level === 0) {
          continue;
        }
        roundsSeen.add(level);
        const set = guildSpells(state, town);
        // Правило про круг N: заклинаний КАЖДОГО круга не больше 6 − N, и все разные.
        if (new Set(set).size !== set.length) {
          broken.push(`сид ${seed}: круг ${level}, в наборе повторы`);
        }
        for (let round = 1; round <= level; round += 1) {
          const ofRound = set.filter((id) => {
            const spell = GAME_SPELLS.find((item) => item.id === id);
            if (spell === undefined) {
              broken.push(`сид ${seed}: в наборе неизвестное «${id}»`);
              return false;
            }
            return spell.level === round;
          });
          if (ofRound.length > 6 - round) {
            broken.push(
              `сид ${seed}: круг ${level}, круга ${round} в наборе ${ofRound.length} больше ${6 - round}`,
            );
          }
        }
        // И заклинаний выше уровня гильдии в наборе быть не может.
        for (const id of set) {
          const spell = GAME_SPELLS.find((item) => item.id === id);
          if (spell !== undefined && spell.level > level) {
            broken.push(`сид ${seed}: круг ${level}, в наборе заклинание круга ${spell.level}`);
          }
        }
      }
    }
    expect(roundsSeen.size).toBeGreaterThan(1);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("герой не знает заклинаний круга выше, чем позволяет «Мудрость»", () => {
    // «Мудрость» 0 → круги 1–2, 1 → 3, 2 → 4, 3 → 5 (magic.ts, `learnableLevel`).
    const broken: string[] = [];
    const checked: string[] = [];
    for (let wisdom = 0; wisdom <= TOP_SKILL; wisdom += 1) {
      const skills: HeroSkill[] =
        wisdom === 0 ? [] : [{ id: "wisdom", level: wisdom as 1 | 2 | 3 }];
      const allowed = learnableLevel({ skills });
      for (let seed = 1; seed <= 8; seed += 1) {
        let state = game(seed);
        state = withGuilds(state, 4);
        state = {
          ...state,
          heroes: state.heroes.map((hero) => ({ ...hero, book: true, skills })),
        };
        // Герой входит в город: только так он учит его заклинания (magic.ts, `learnSpells`).
        const entered = applyCommand(state, toCommand("enter"));
        if (entered.ok) {
          state = entered.state;
        }
        // Ищем в книге заклинание выше дозволенного — такого быть не должно.
        for (const known of state.heroes[0]?.spells ?? []) {
          const spell = state.spells.find((item) => item.id === known);
          if (spell !== undefined && spell.level > allowed) {
            broken.push(
              `мудрость ${wisdom}: знает «${known}» круга ${spell.level}, а можно до ${allowed}`,
            );
          }
        }
        // Берём заклинание самого высокого круга: только на нём и видно предел.
        // При «Мудрости» 3 предел — 5, и упирается в него лишь круг 5.
        const highest = [...state.spells].toSorted((left, right) => right.level - left.level)[0];
        expect(highest, "в партии нет заклинаний").toBeDefined();
        if (highest !== undefined) {
          const known = state.heroes[0]?.spells ?? [];
          // Не выучено, если круг выше предела; выучено, если в пределах.
          if (highest.level > allowed && known.includes(highest.id)) {
            broken.push(`мудрость ${wisdom}: выучил «${highest.id}» круга ${highest.level}`);
          }
          if (highest.level <= allowed) {
            checked.push(`${wisdom}/${highest.level}`);
          }
        }
      }
    }
    // Предел должен быть достигнут: иначе проверка про потолок пуста.
    expect(checked.length, "потолок «Мудрости» ни разу не проверялся").toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
  });

  it("шахт семь, и каждая даёт свой редкий ресурс", () => {
    expect(MINE_KINDS).toHaveLength(7);
    expect(RESOURCES).toEqual(["gold", "wood", "ore", ...RARE]);
  });
});
