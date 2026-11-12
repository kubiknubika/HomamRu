/** Журнал боя для игрока: события одной команды одной строкой. */
import { findStack } from "@homamru/core";
import type { BattleEvent, BattleState } from "@homamru/core";

const STRIKE_VERBS = { melee: "бьёт", retaliation: "отвечает", shot: "стреляет" } as const;

function describeEvent(event: BattleEvent, nameOf: (id: string) => string): string | null {
  switch (event.type) {
    case "roundStarted":
      return `Раунд ${event.round}`;
    case "stackFroze":
      return `${nameOf(event.stackId)}: низкий боевой дух, ход пропущен`;
    case "strike": {
      const luck = event.lucky ? ", удача" : "";
      const who = `${nameOf(event.attackerId)} ${STRIKE_VERBS[event.kind]}`;
      return `${who} (цель: ${nameOf(event.targetId)}): урон ${event.damage}${luck}, погибло ${event.killed}`;
    }
    case "stackDied":
      return `${nameOf(event.stackId)}: отряд погиб`;
    case "stackWaits":
      return `${nameOf(event.stackId)} ждёт`;
    case "stackDefends":
      return `${nameOf(event.stackId)} защищается: защита +${event.bonus}`;
    case "moraleTurn":
      return `${nameOf(event.stackId)}: высокий боевой дух, ещё один ход`;
    case "sideFled":
      return event.side === 0 ? "Вы бежали с поля боя" : "Противник бежал";
    case "stackTurn":
    case "stackMoved":
    case "battleEnded":
      return null;
  }
}

/**
 * Строка журнала по событиям команды. Если ничего, кроме перемещения, не случилось —
 * строка о перемещении.
 */
export function describeEvents(events: readonly BattleEvent[], state: BattleState): string {
  const nameOf = (id: string): string => findStack(state, id)?.creature.name ?? id;
  const parts: string[] = [];
  for (const event of events) {
    const text = describeEvent(event, nameOf);
    if (text !== null) {
      parts.push(text);
    }
  }
  const moved = events.find((event) => event.type === "stackMoved");
  if (moved !== undefined && !events.some((event) => event.type === "strike")) {
    parts.unshift(`${nameOf(moved.stackId)} перемещается`);
  }
  return parts.join("; ");
}
