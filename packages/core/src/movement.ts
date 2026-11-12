/**
 * Команда «переместить героя». Спецификация: docs/mechanics/02-hero-movement.md.
 */
import { guardWatching } from "./guards.ts";
import { deltaOf, stepCost, terrainAllowsStep } from "./map.ts";
import { startBattle } from "./mapBattle.ts";
import type { BattleTarget } from "./mapBattle.ts";
import { captureTown } from "./players.ts";
import { addResources, objectAt } from "./objects.ts";
import { reject } from "./types.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
  MoveHeroCommand,
  ObjectState,
  TownState,
} from "./types.ts";

/** Чужой город под клеткой, если он там есть. */
function enemyTown(object: ObjectState | undefined, player: number): TownState | undefined {
  return object?.type === "town" && object.owner !== player ? object : undefined;
}

/** На кого нападает герой последним шагом пути: чужой герой или чужой город с защитниками. */
function attackTarget(
  hero: HeroState,
  defender: HeroState | undefined,
  object: ObjectState | undefined,
): BattleTarget | undefined {
  const town = enemyTown(object, hero.owner);
  if (defender !== undefined) {
    return { hero: defender, town };
  }
  return town !== undefined && town.garrison.length > 0 ? { town } : undefined;
}

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
  /** С кем этот ход начинает бой: охранник (21-guards.md), чужой герой или город. */
  let enemy: BattleTarget | undefined;
  /** Пустой чужой город, в который герой вошёл. */
  let taken: TownState | undefined;
  for (const [index, direction] of command.path.entries()) {
    const delta = deltaOf(direction);
    if (delta === undefined || !terrainAllowsStep(state.map, x, y, delta)) {
      return reject(
        "STEP_BLOCKED",
        `Шаг ${index + 1} (${direction}) из клетки (${x}, ${y}) невозможен.`,
      );
    }
    const to = { x: x + delta.dx, y: y + delta.dy };
    const last = index === command.path.length - 1;
    const other = others.find((candidate) => candidate.x === to.x && candidate.y === to.y);
    if (other !== undefined && (other.owner === hero.owner || !last)) {
      // Свой герой непроходим; на чужого можно только напасть — концом пути.
      return reject(
        "STEP_BLOCKED",
        `Шаг ${index + 1}: в клетке (${to.x}, ${to.y}) стоит другой герой.`,
      );
    }
    const object = objectAt(state, to.x, to.y);
    if (object !== undefined && !last) {
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
    if (object?.type === "guard") {
      // Нападение с соседней клетки: очки потрачены, герой остаётся на месте.
      enemy = { guard: object };
      break;
    }
    enemy = attackTarget(hero, other, object);
    if (enemy !== undefined) {
      // Чужой герой или город с защитниками: тоже с соседней клетки (40-two-players.md).
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
    const guard = guardWatching(state, x, y);
    if (guard !== undefined) {
      enemy = { guard };
      // Шаг закончился в зоне охранника: герой останавливается, остаток пути не идёт.
      // Шахту в этой клетке он займёт, только если победит.
      break;
    }
    if (object?.type === "mine" && object.owner !== hero.owner) {
      captured = object;
    }
    taken = enemyTown(object, hero.owner);
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
  const after: GameState = {
    ...state,
    objects,
    players,
    heroes: state.heroes.map((candidate) => (candidate.id === hero.id ? moved : candidate)),
  };
  if (enemy !== undefined) {
    return { ok: true, state: startBattle(after, moved, enemy, events), events };
  }
  if (taken !== undefined) {
    // Пустой город: герой вошёл, город захвачен без боя.
    return { ok: true, state: captureTown(after, taken, hero.owner, false, events), events };
  }
  return { ok: true, state: after, events };
}
