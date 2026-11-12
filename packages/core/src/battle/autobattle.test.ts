import { describe, expect, it } from "vitest";
import { chooseBattleCommand } from "./ai.ts";
import { AUTO_BATTLE_MAX_ROUNDS, randomBattle, runAutoBattle } from "./autobattle.ts";
import { replayBattle } from "./commands.ts";
import { createBattle } from "./create.ts";
import { CREATURES } from "./testkit.ts";

const BATTLES = 1000;

describe("автобои — 15-battle-ai.md", () => {
  it(`${BATTLES} боёв двух компьютеров: заканчиваются, свойства не нарушены, побеждают обе стороны`, () => {
    const failed: string[] = [];
    const wins = [0, 0];
    const types = new Set<string>();
    let longest = 0;
    for (let seed = 1; seed <= BATTLES; seed += 1) {
      const run = runAutoBattle(randomBattle(seed, CREATURES), CREATURES, seed);
      const winner = run.state?.result?.winner;
      if (run.problems.length > 0 || winner === undefined) {
        failed.push(`сид ${seed}: ${run.problems.join("; ") || "нет итога"}`);
        continue;
      }
      wins[winner] = (wins[winner] ?? 0) + 1;
      longest = Math.max(longest, run.state?.round ?? 0);
      for (const command of run.commands) {
        types.add(command.type);
      }
    }
    // Упавший автобой повторяется точно: pnpm run play --autobattle <сид>.
    expect(failed).toEqual([]);
    expect(longest).toBeLessThanOrEqual(AUTO_BATTLE_MAX_ROUNDS);
    expect(wins[0]).toBeGreaterThan(BATTLES / 4);
    expect(wins[1]).toBeGreaterThan(BATTLES / 4);
    // Компьютер не ждёт и не бежит; остальные команды в ходу.
    expect([...types].toSorted()).toEqual([
      "battleAttack",
      "battleDefend",
      "battleMove",
      "battleShoot",
    ]);
    // Тысяча боёв идёт около 3 с; на медленной машине проверки не укладывалась в обычные 5 с.
  }, 30_000);

  it("случайный бой по одному сиду всегда один и тот же, по разным — разный", () => {
    expect(randomBattle(5, CREATURES)).toEqual(randomBattle(5, CREATURES));
    expect(randomBattle(5, CREATURES)).not.toEqual(randomBattle(6, CREATURES));
  });

  it("автобой повторяется: тот же сид — те же команды и итог; повтор по командам сходится", () => {
    for (const seed of [1, 2, 3, 77]) {
      const definition = randomBattle(seed, CREATURES);
      const first = runAutoBattle(definition, CREATURES, seed);
      const second = runAutoBattle(definition, CREATURES, seed);
      expect(second).toEqual(first);
      const created = createBattle(definition, CREATURES, seed);
      const initial = created.ok ? created.state : null;
      expect(initial).not.toBeNull();
      expect(initial === null ? null : replayBattle(initial, first.commands)).toMatchObject({
        ok: true,
        state: first.state,
      });
    }
  });

  it("при одинаковом состоянии компьютер выбирает одну и ту же команду", () => {
    const created = createBattle(randomBattle(9, CREATURES), CREATURES, 9);
    const state = created.ok ? created.state : null;
    expect(state).not.toBeNull();
    const pick = () => (state === null ? undefined : chooseBattleCommand(state));
    expect(pick()).toEqual(pick());
    expect(pick()).toBeDefined();
  });

  it("неверное описание боя — провал без исключения", () => {
    const definition = { ...randomBattle(1, CREATURES), obstacles: [{ col: 0, row: 0 }] };
    const run = runAutoBattle(definition, CREATURES, 1);
    expect(run.state).toBeNull();
    expect(run.problems.length).toBeGreaterThan(0);
  });
});
