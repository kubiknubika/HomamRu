/** Журнал боя для игрока: события одной команды одной строкой. */
import { findStack } from "@homamru/core";
import type { BattleEvent, BattleState, StackState } from "@homamru/core";

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
      return `${who}: ${nameOf(event.targetId)}, урон ${event.damage}${luck}, погибло ${event.killed}`;
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
  // В бою у сторон бывают одинаковые существа — в журнале сказано, чей отряд.
  const nameOf = (id: string): string => {
    const stack = findStack(state, id);
    return stack === undefined
      ? id
      : `${stack.creature.name} (${stack.side === 0 ? "ваш" : "враг"})`;
  };
  const parts: string[] = [];
  // Боевой дух — в начале строки: он объясняет, почему отряд ходит снова или пропускает ход.
  const morale: string[] = [];
  for (const event of events) {
    const text = describeEvent(event, nameOf);
    if (text !== null) {
      (event.type === "moraleTurn" || event.type === "stackFroze" ? morale : parts).push(text);
    }
  }
  const moved = events.find((event) => event.type === "stackMoved");
  if (moved !== undefined && !events.some((event) => event.type === "strike")) {
    parts.unshift(`${nameOf(moved.stackId)} перемещается`);
  }
  return [...morale, ...parts].join("; ");
}

/**
 * Сколько существ отряд потерял в бою. Бежавшая сторона теряет армию целиком,
 * как в Heroes 3 (docs/mechanics/11-battle-turns.md).
 */
export function lostCount(state: BattleState, stack: StackState): number {
  const fled = state.result?.reason === "fled" && state.result.winner !== stack.side;
  return fled ? stack.initialCount : stack.initialCount - stack.count;
}

/** Характеристики отряда одной строкой — для показа по удержанию пальца. */
export function describeStack(state: BattleState, stack: StackState): string {
  const { creature } = stack;
  const hero = state.sides[stack.side].hero;
  const attack = creature.attack + (hero?.attack ?? 0);
  const defense = creature.defense + (hero?.defense ?? 0) + stack.defendBonus;
  const parts = [
    `${creature.name}: ${stack.count} из ${stack.initialCount}`,
    `атака ${attack}`,
    `защита ${defense}`,
    `урон ${creature.damageMin}–${creature.damageMax}`,
    `здоровье ${stack.firstHealth} из ${creature.health}`,
    `скорость ${creature.speed}`,
  ];
  if (creature.flying) {
    parts.push("летает");
  }
  if (creature.shots > 0) {
    parts.push(`стрелок, выстрелов ${stack.shots} из ${creature.shots}`);
  }
  if (stack.retaliated) {
    parts.push("уже отвечал на удар");
  }
  return parts.join(" · ");
}
