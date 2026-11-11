/**
 * Команда «переместить героя». Спецификация: docs/mechanics/02-hero-movement.md.
 */
import { deltaOf, stepCost, terrainAllowsStep } from "./map.ts";
import { reject } from "./types.ts";
import type { CommandResult, GameEvent, GameState, MoveHeroCommand } from "./types.ts";

export function applyMoveHero(state: GameState, command: MoveHeroCommand): CommandResult {
  const hero = state.heroes.find((candidate) => candidate.id === command.heroId);
  if (hero === undefined) {
    return reject("UNKNOWN_HERO", `Героя «${command.heroId}» нет.`);
  }
  if (hero.owner !== command.player) {
    return reject("NOT_OWNER", `Герой «${hero.id}» принадлежит другому игроку.`);
  }
  if (command.path.length === 0) {
    return reject("EMPTY_PATH", "В пути нет ни одного шага.");
  }

  const others = state.heroes.filter((candidate) => candidate.id !== hero.id);
  const events: GameEvent[] = [];
  let { x, y, movement } = hero;
  for (const [index, direction] of command.path.entries()) {
    const delta = deltaOf(direction);
    if (delta === undefined || !terrainAllowsStep(state.map, x, y, delta)) {
      return reject(
        "STEP_BLOCKED",
        `Шаг ${index + 1} (${direction}) из клетки (${x}, ${y}) невозможен.`,
      );
    }
    const to = { x: x + delta.dx, y: y + delta.dy };
    if (others.some((other) => other.x === to.x && other.y === to.y)) {
      return reject(
        "STEP_BLOCKED",
        `Шаг ${index + 1}: в клетке (${to.x}, ${to.y}) стоит другой герой.`,
      );
    }
    const cost = stepCost(delta);
    if (movement < cost) {
      return reject(
        "NOT_ENOUGH_MOVEMENT",
        `Шаг ${index + 1}: нужно ${cost} очков хода, осталось ${movement}.`,
      );
    }
    movement -= cost;
    events.push({
      type: "heroStepped",
      heroId: hero.id,
      from: { x, y },
      to,
      cost,
      movementLeft: movement,
    });
    x = to.x;
    y = to.y;
  }

  const moved = { ...hero, x, y, movement };
  return {
    ok: true,
    state: {
      ...state,
      heroes: state.heroes.map((candidate) => (candidate.id === hero.id ? moved : candidate)),
    },
    events,
  };
}
