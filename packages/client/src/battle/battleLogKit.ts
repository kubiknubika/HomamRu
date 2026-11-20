// Общие помощники тестов журнала боя.
import type { BattleEvent, BattleState } from "@homamru/core";
import { describeEvents } from "./battleLog.ts";
import { battle, place } from "./testkit.ts";

/** Бой, в котором журналу есть о ком говорить: свой и вражеский отряд. */
export function field(): BattleState {
  return place(battle(["militia:10"], ["militia:10"]), {
    a1: [4, 5],
    b1: [5, 5],
  });
}

/** Строка журнала по одному событию. */
export function line(event: BattleEvent, state = field(), playerSide: 0 | 1 = 0): string {
  return describeEvents([event], state, playerSide);
}
