// Помощники тестов экрана: действия игрока так, как их делает палец.
import { chooseBattleCommand } from "@homamru/core";
import type { Session } from "./session.ts";

/** Два касания клетки: показать путь и пойти. */
export function go(session: Session, x: number, y: number): void {
  session.tapCell({ x, y });
  session.tapCell({ x, y });
}

/** Доигрывает бой на экране: за игрока ходит тот же простой компьютер. */
export function finishBattle(session: Session): void {
  const battle = session.getSnapshot().battle;
  if (battle === null) {
    return;
  }
  for (let turn = 0; turn < 500; turn += 1) {
    battle.animationDone();
    const { state } = battle.getSnapshot();
    const command = chooseBattleCommand(state);
    if (command === undefined) {
      return;
    }
    if (command.type === "battleMove") {
      battle.tapCell(command.to);
      battle.tapCell(command.to);
    } else if (command.type === "battleAttack") {
      const target = state.stacks.find((stack) => stack.id === command.target);
      battle.tapCell(target ?? command.from);
      battle.tapCell(command.from);
      battle.tapCell(command.from);
    } else if (command.type === "battleWait") {
      battle.wait();
    } else {
      battle.defend();
    }
  }
}
