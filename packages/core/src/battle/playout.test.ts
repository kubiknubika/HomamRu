import { describe, expect, it } from "vitest";
import { applyBattleCommand, replayBattle } from "./commands.ts";
import { cellIndex, distance } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { attackCells, canShoot, findStack, reachableCells } from "./queries.ts";
import { army, stack, startBattle } from "./testkit.ts";
import type { BattleCommand, BattleState } from "./types.ts";

/** Простая линия поведения для проверок: стрелять, ударить, подойти. Настоящий компьютер — шаг 2.2. */
function choose(state: BattleState): BattleCommand {
  const me = stack(state, state.activeStack ?? "");
  const side = me.side;
  const enemies = state.stacks.filter((s) => s.side !== side && s.count > 0);
  const first = enemies[0];
  if (first === undefined) {
    return { type: "battleDefend", side };
  }
  if (canShoot(state, me)) {
    return { type: "battleShoot", side, target: first.id };
  }
  for (const enemy of enemies) {
    const from = attackCells(state, me, enemy)[0];
    if (from !== undefined) {
      return { type: "battleAttack", side, target: enemy.id, from };
    }
  }
  let best: Cell | undefined;
  for (const cell of reachableCells(state, me).values()) {
    if (best === undefined || distance(cell, first) < distance(best, first)) {
      best = cell;
    }
  }
  return best === undefined || distance(best, first) >= distance(me, first)
    ? { type: "battleDefend", side }
    : { type: "battleMove", side, to: best };
}

/** Нарушения свойств, верных всегда; пустой список — всё в порядке. */
function problemsOf(state: BattleState): string[] {
  const problems: string[] = [];
  const alive = state.stacks.filter((s) => s.count > 0);
  if (new Set(alive.map((s) => cellIndex(s))).size !== alive.length) {
    problems.push("два отряда в одной клетке");
  }
  for (const s of alive) {
    if (state.obstacles.some((o) => o.col === s.col && o.row === s.row)) {
      problems.push(`${s.id} стоит на препятствии`);
    }
    if (s.firstHealth < 1 || s.firstHealth > s.creature.health) {
      problems.push(`${s.id}: здоровье первого ${s.firstHealth}`);
    }
    if (s.count > s.initialCount || s.shots < 0) {
      problems.push(`${s.id}: существ ${s.count}, выстрелов ${s.shots}`);
    }
  }
  if (state.result === null && (findStack(state, state.activeStack ?? "")?.count ?? 0) === 0) {
    problems.push("ходит погибший или несуществующий отряд");
  }
  return problems;
}

function play(seed: number) {
  const started = startBattle(
    army(["militia:20", "slinger:12", "falcon:5"], { morale: 2, luck: 2 }),
    army(["militia:30", "slinger:8", "falcon:3"], { morale: -2, luck: 1 }),
    {
      seed,
      obstacles: [
        { col: 6, row: 3 },
        { col: 7, row: 5 },
        { col: 8, row: 7 },
      ],
    },
  ).state;
  let state = started;
  const commands: BattleCommand[] = [];
  const problems: string[] = [];
  while (state.result === null && commands.length < 5000) {
    const command = choose(state);
    const result = applyBattleCommand(state, command);
    if (!result.ok) {
      throw new Error(`Сид ${seed}: отказ ${result.code}`);
    }
    commands.push(command);
    state = result.state;
    problems.push(...problemsOf(state));
  }
  return { started, state, commands, problems };
}

describe("целый бой: детерминизм и свойства", () => {
  it("бои заканчиваются, и побеждают обе стороны", () => {
    const winners = new Set<number>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const { state, problems } = play(seed);
      expect(problems).toEqual([]);
      expect(state.result).not.toBeNull();
      expect(state.round).toBeLessThanOrEqual(200);
      const winner = state.result?.winner ?? 0;
      winners.add(winner);
      expect(state.stacks.some((s) => s.side !== winner && s.count > 0)).toBe(false);
      expect(state.stacks.some((s) => s.side === winner && s.count > 0)).toBe(true);
    }
    expect(winners.size).toBe(2);
  });

  it("одинаковый сид и команды — одинаковый бой; повтор даёт то же состояние", () => {
    for (const seed of [1, 2, 3, 77]) {
      const first = play(seed);
      const second = play(seed);
      expect(second.commands).toEqual(first.commands);
      expect(second.state).toEqual(first.state);
      expect(replayBattle(first.started, first.commands)).toMatchObject({
        ok: true,
        state: first.state,
      });
    }
    expect(play(1).commands).not.toEqual(play(2).commands);
  });

  it("повтор с неверной командой называет её номер", () => {
    const { started } = play(1);
    const other = stack(started, started.activeStack ?? "").side === 0 ? 1 : 0;
    expect(replayBattle(started, [{ type: "battleDefend", side: other }])).toEqual({
      ok: false,
      commandIndex: 0,
      code: "NOT_YOUR_STACK",
    });
  });
});
