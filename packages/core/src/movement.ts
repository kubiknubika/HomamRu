/**
 * Команда «переместить героя». Спецификация: docs/mechanics/02-hero-movement.md.
 */
import { deltaOf, stepCost, terrainAllowsStep } from "./map.ts";
import { addResources, objectAt } from "./objects.ts";
import { reject } from "./types.ts";
import type { CommandResult, GameEvent, GameState, MoveHeroCommand, ObjectState } from "./types.ts";

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
  let picked: Extract<ObjectState, { type: "pile" }> | undefined;
  let captured: Extract<ObjectState, { type: "mine" }> | undefined;
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
    const object = objectAt(state, to.x, to.y);
    if (object !== undefined && index !== command.path.length - 1) {
      // Сквозь объект пройти нельзя: его клетка может быть только концом пути.
      return reject(
        "STEP_BLOCKED",
        `Шаг ${index + 1}: в клетке (${to.x}, ${to.y}) стоит объект, пройти сквозь него нельзя.`,
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
    if (object?.type === "pile") {
      // Кучку подбирают с соседней клетки: очки потрачены, герой на её клетку не встаёт.
      picked = object;
      break;
    }
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
    if (object?.type === "mine" && object.owner !== hero.owner) {
      captured = object;
    }
  }

  const moved = { ...hero, x, y, movement };
  let { objects, players } = state;
  if (picked !== undefined) {
    const { id, resource, amount } = picked;
    objects = objects.filter((candidate) => candidate.id !== id);
    players = players.map((player) =>
      player.id === hero.owner
        ? { ...player, resources: addResources(player.resources, { [resource]: amount }) }
        : player,
    );
    events.push({ type: "pilePicked", objectId: id, player: hero.owner, resource, amount });
  }
  if (captured !== undefined) {
    const { id, owner: previousOwner } = captured;
    objects = objects.map((candidate) =>
      candidate.id === id && candidate.type === "mine"
        ? { ...candidate, owner: hero.owner }
        : candidate,
    );
    events.push({ type: "mineCaptured", objectId: id, owner: hero.owner, previousOwner });
  }
  return {
    ok: true,
    state: {
      ...state,
      objects,
      players,
      heroes: state.heroes.map((candidate) => (candidate.id === hero.id ? moved : candidate)),
    },
    events,
  };
}
