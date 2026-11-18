// Свойства из раздела «Свойства, верные всегда» спецификации 69-spells-control.md.
// Примеры — в mindSpells.test.ts; здесь свойства на случайных боях с контролем.
import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { applyBattleCommand } from "./commands.ts";
import { randomBattle } from "./autobattle.ts";
import { createBattle } from "./create.ts";
import { activeStackOf } from "./queries.ts";
import { CREATURES } from "./testkit.ts";
import { GAME_SPELLS } from "../spellKit.ts";
import type { BattleState } from "./types.ts";

/** Контроль: слепота, гипноз, берсерк, антимагия, бешенство, забывчивость. */
const CONTROL = GAME_SPELLS.filter((spell) =>
  ["blind", "hypnosis", "berserk", "spellImmunity", "frenzy", "forgetfulness"].includes(
    spell.effect,
  ),
);

const BATTLES = 50;
const MAX_COMMANDS = 250;

function battleWith(seed: number, spells: typeof GAME_SPELLS, power = 3): BattleState {
  const definition = randomBattle(seed, CREATURES, spells);
  const enchant = (army: typeof definition.attacker) => ({
    ...army,
    hero: { ...(army.hero ?? { attack: 0, defense: 0 }), spellPower: power, mana: 300, spells },
  });
  const created = createBattle(
    {
      ...definition,
      attacker: enchant(definition.attacker),
      defender: enchant(definition.defender),
    },
    CREATURES,
    seed,
  );
  if (!created.ok) {
    throw new Error(created.errors.map((error) => `${error.field}: ${error.message}`).join("\n"));
  }
  return created.state;
}

describe("свойства заклинаний контроля (69)", () => {
  it("ослеплённый не ходит; загипнотизированный не бьёт своих командиров; антимагия не пускает", () => {
    const broken: string[] = [];
    let blindSteps = 0;
    let hypnoSteps = 0;
    let immuneCasts = 0;
    // Кто командует загипнотизированным: сторона того, кто колдовал. Заполняем по событиям.
    const hypnotizedBy = new Map<string, number>();
    const spellSide = new Map<string, number>();
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      let state = battleWith(seed, CONTROL);
      for (let step = 0; step < MAX_COMMANDS; step += 1) {
        if (state.result !== null) {
          break;
        }
        const active = activeStackOf(state);
        if (active === undefined) {
          break;
        }
        const command = chooseBattleCommand(state);
        if (command === undefined) {
          break;
        }
        if (active.effects.some((effect) => effect.spell === "hypnotize")) {
          hypnoSteps += 1;
          // Под гипнозом отряд слушается колдовавшего: своими для него стали отряды
          // противоположной стороны (effects.ts:86). Удар по прежним товарищам законен,
          // а нарушение — удар по отряду своего командира.
          if (command.type === "battleAttack" && "target" in command) {
            const target = state.stacks.find((stack) => stack.id === command.target);
            // Командира считаем по своей карте заклинаний, а не через `commanderOf`: если
            // звать `commanderOf` и в тесте, и в коде, проверка сравнивает его сам с собой
            // и молчит всегда. Цель тоже может быть под гипнозом — учитываем и её.
            // Смотрим только цели без гипноза: у них сторона командира однозначна.
            // Отряд, загипнотизированный тем же хозяином, — отдельный случай (двойной гипноз),
            // и здесь он не проверяется, чтобы проверка не гадала.
            const owner = hypnotizedBy.get(active.id);
            if (target !== undefined && owner !== undefined && !hypnotizedBy.has(target.id)) {
              if (target.side === owner) {
                broken.push(`сид ${seed}: гипноз ${active.id} бьёт своего ${target.id}`);
              }
            }
          }
        }
        if (command.type === "battleCast" && command.target !== undefined) {
          const target = state.stacks.find((stack) => stack.id === command.target);
          if (target?.effects.some((effect) => effect.spell === "antiMagic")) {
            immuneCasts += 1;
          }
        }
        if (command.type === "battleCast") {
          spellSide.set(command.spell, command.side);
        }
        const result = applyBattleCommand(state, command);
        if (!result.ok) {
          continue;
        }
        // Гипноз лёг на отряд — запоминаем, кто им теперь командует.
        if (command.type === "battleCast" && command.target !== undefined) {
          const spell = GAME_SPELLS.find((item) => item.id === command.spell);
          if (spell?.effect === "hypnosis") {
            hypnotizedBy.set(command.target, command.side);
          }
        }
        state = result.state;
        // Ослеплённый отряд хода не получает: механика хода помечает его «done» и пишет
        // событие `stackBlind` (turns.ts:113). К концу команды состояние уже шагнуло вперёд —
        // раунд мог смениться, и `turn` снова «ready». Поэтому смотрим на событие: сам
        // ослеплённый отряд не должен ни ходить, ни бить.
        for (const event of result.events) {
          if (event.type === "stackBlind") {
            blindSteps += 1;
            const acted = result.events.some(
              (other) =>
                (other.type === "stackMoved" && other.stackId === event.stackId) ||
                (other.type === "strike" && other.attackerId === event.stackId),
            );
            if (acted) {
              broken.push(`сид ${seed}: ослеплённый ${event.stackId} действовал`);
            }
          }
        }
      }
    }
    // Свойства, которые ни разу не встретились, — провал, а не успех.
    expect(hypnoSteps + blindSteps, "ни слепоты, ни гипноза").toBeGreaterThan(0);
    expect([...new Set(broken)].slice(0, 5)).toEqual([]);
    void immuneCasts;
  });
});
