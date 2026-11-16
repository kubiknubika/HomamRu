/**
 * Компьютерный игрок на карте: по состоянию партии выбирает одну следующую команду.
 * Случайных чисел не тратит: при одном состоянии команда одна и та же.
 * Спецификация: docs/mechanics/42-opponent.md.
 */
import { guardBattleCommand } from "./battleAuto.ts";
import { guardWatching } from "./guards.ts";
import { heroChoosingSkill } from "./hero.ts";
import { BOOK_PRICE, learnableSpells } from "./magic.ts";
import { accepted, armyValue, townCommand, townsOf } from "./opponentTown.ts";
import { findPath } from "./pathfinding.ts";
import type { PathResult } from "./pathfinding.ts";
import type { Command, GameState, HeroState, ObjectState, Position, TownState } from "./types.ts";

/** За сколько дней враг должен дойти до города, чтобы герой пошёл его оборонять. */
const THREAT_DAYS = 2;
/** Гарнизон не меньше стольких процентов армии героя — герой идёт за ним в город. */
const REFILL_PERCENT = 60;
const PERCENT = 100;

type FoundPath = Extract<PathResult, { found: true }>;

interface Target {
  readonly path: FoundPath;
  /** Сила защитников цели: сумма цен найма. */
  readonly strength: number;
}

function pathTo(state: GameState, hero: HeroState, cell: Position): FoundPath | undefined {
  const path = findPath(state, hero.id, cell);
  return path.found && path.steps.length > 0 ? path : undefined;
}

function at(hero: HeroState, cell: Position): boolean {
  return hero.x === cell.x && hero.y === cell.y;
}

function heroAt(state: GameState, cell: Position): HeroState | undefined {
  return state.heroes.find((hero) => at(hero, cell));
}

/** Город, в котором стоит герой, если это город его владельца. */
function townUnder(state: GameState, hero: HeroState): TownState | undefined {
  return townsOf(state, hero.owner).find((town) => at(hero, town));
}

/** Сила героя как цели: в своём городе он обороняется вместе с гарнизоном. */
function heroStrength(state: GameState, enemy: HeroState): number {
  const garrison = townUnder(state, enemy)?.garrison ?? [];
  return armyValue(state, [...enemy.army, ...garrison]);
}

/** Хватает ли перевеса, чтобы напасть на цель такой силы. */
function canBeat(state: GameState, hero: HeroState, strength: number): boolean {
  return armyValue(state, hero.army) * PERCENT >= strength * state.opponent.advantagePercent;
}

/**
 * Оборона: враг может дойти до моего города за два дня, а мой герой с гарнизоном сильнее его.
 * Если врага можно победить с перевесом — идти на него; иначе — в город и стоять там.
 * `null` — обороняться не от кого.
 */
function defencePath(state: GameState, hero: HeroState): FoundPath | undefined | null {
  const mine = armyValue(state, hero.army);
  const enemies = state.heroes.filter((other) => other.owner !== hero.owner);
  for (const town of townsOf(state, hero.owner)) {
    const threat = enemies.find((enemy) => {
      const path = findPath(state, enemy.id, town);
      const near = path.found && path.days <= THREAT_DAYS;
      return near && mine + armyValue(state, town.garrison) > armyValue(state, enemy.army);
    });
    if (threat !== undefined) {
      const strike = canBeat(state, hero, heroStrength(state, threat))
        ? pathTo(state, hero, threat)
        : undefined;
      return strike ?? pathTo(state, hero, town);
    }
  }
  return null;
}

/**
 * Смертельная угроза: герой стоит в своём городе, а врага, который дойдёт за два дня,
 * не побить даже вместе с гарнизоном. Тогда герой остаётся в городе (шаг 7.7).
 */
function doomedAtHome(state: GameState, hero: HeroState): boolean {
  const town = townUnder(state, hero);
  if (town === undefined) {
    return false;
  }
  const garrison = armyValue(state, town.garrison);
  const mine = armyValue(state, hero.army) + garrison;
  return state.heroes.some((enemy) => {
    if (enemy.owner === hero.owner || armyValue(state, enemy.army) <= mine) {
      return false;
    }
    const path = findPath(state, enemy.id, town);
    return path.found && path.days <= THREAT_DAYS;
  });
}

/** Есть ли герою зачем идти в свой город: купить книгу (золота хватает) или выучить заклинания. */
function teaches(state: GameState, hero: HeroState, town: TownState): boolean {
  if (
    learnableSpells(state, { ...hero, spells: hero.book ? hero.spells : [] }, town).length === 0
  ) {
    return false;
  }
  return hero.book || (state.players[hero.owner]?.resources.gold ?? 0) >= BOOK_PRICE;
}

/** Берётся ли объект без боя: кучка, не своя шахта, пустой чужой город — вне зоны охранника. */
function isFree(state: GameState, hero: HeroState, object: ObjectState): boolean {
  if (object.type === "guard" || guardWatching(state, object.x, object.y) !== undefined) {
    // В зоне охранника без боя не обойтись.
    return false;
  }
  if (object.type === "pile") {
    return true;
  }
  if (object.owner === hero.owner) {
    // Свой город с гильдией — тоже цель: купить книгу или выучить новое (63-opponent-magic.md).
    return object.type === "town" && !at(hero, object) && teaches(state, hero, object);
  }
  const empty = object.type === "mine" || object.garrison.length === 0;
  return empty && heroAt(state, object) === undefined;
}

function nearest<T extends { readonly path: FoundPath }>(items: readonly T[]): T | undefined {
  return items.toSorted((a, b) => a.path.cost - b.path.cost)[0];
}

/** Сила того, на что можно напасть; `undefined` — объект не цель нападения. */
function strengthOf(state: GameState, hero: HeroState, object: ObjectState): number | undefined {
  if (object.type === "guard") {
    return armyValue(state, [object]);
  }
  if (object.type !== "town" || object.owner === hero.owner) {
    return undefined;
  }
  // Герой в городе обороняется вместе с гарнизоном: он считается как герой.
  const defended = object.garrison.length > 0 && heroAt(state, object) === undefined;
  return defended ? armyValue(state, object.garrison) : undefined;
}

/** Всё, на что можно напасть: охранники, чужие герои, чужие города с гарнизоном. */
function attackTargets(state: GameState, hero: HeroState): Target[] {
  const targets: Target[] = [];
  const add = (cell: Position, strength: number): void => {
    const path = pathTo(state, hero, cell);
    if (path !== undefined) {
      targets.push({ path, strength });
    }
  };
  for (const object of state.objects) {
    const strength = strengthOf(state, hero, object);
    if (strength !== undefined) {
      add(object, strength);
    }
  }
  for (const enemy of state.heroes.filter((other) => other.owner !== hero.owner)) {
    add(enemy, heroStrength(state, enemy));
  }
  return targets;
}

/** Самая слабая цель, которую можно победить; при равной силе — ближайшая. */
function attackPath(state: GameState, hero: HeroState): FoundPath | undefined {
  const beatable = attackTargets(state, hero).filter((target) =>
    canBeat(state, hero, target.strength),
  );
  return beatable.toSorted((a, b) => a.strength - b.strength || a.path.cost - b.path.cost)[0]?.path;
}

function pathsTo(state: GameState, hero: HeroState, cells: readonly Position[]): Target[] {
  return cells.flatMap((cell) => {
    const path = pathTo(state, hero, cell);
    return path === undefined ? [] : [{ path, strength: 0 }];
  });
}

/** Чужой герой, которого можно победить и достать сегодня: ближайший. */
function huntPath(state: GameState, hero: HeroState): FoundPath | undefined {
  const foes = state.heroes.filter(
    (other) => other.owner !== hero.owner && canBeat(state, hero, heroStrength(state, other)),
  );
  const path = nearest(pathsTo(state, hero, foes))?.path;
  return path !== undefined && path.days <= 1 ? path : undefined;
}

/** Свой город, где накопился большой гарнизон: ближайший. Стоя в своём городе, герой никуда не идёт. */
function refillPath(state: GameState, hero: HeroState): FoundPath | undefined {
  if (townUnder(state, hero) !== undefined) {
    return undefined;
  }
  const need = armyValue(state, hero.army) * REFILL_PERCENT;
  const rich = townsOf(state, hero.owner).filter(
    (town) => armyValue(state, town.garrison) * PERCENT >= need,
  );
  return nearest(pathsTo(state, hero, rich))?.path;
}

/** Куда идти герою; `undefined` — стоять. Порядок — из 42-opponent.md. */
function goalPath(state: GameState, hero: HeroState): FoundPath | undefined {
  if (doomedAtHome(state, hero)) {
    return undefined;
  }
  const defence = defencePath(state, hero);
  if (defence !== null) {
    return defence;
  }
  const urgent = huntPath(state, hero) ?? refillPath(state, hero);
  if (urgent !== undefined) {
    return urgent;
  }
  const free = pathsTo(
    state,
    hero,
    state.objects.filter((object) => isFree(state, hero, object)),
  );
  const attack = nearest(free)?.path ?? attackPath(state, hero);
  if (attack !== undefined) {
    return attack;
  }
  // За пополнением: в ближайший свой город; в городе — ждать.
  if (townUnder(state, hero) !== undefined) {
    return undefined;
  }
  return nearest(pathsTo(state, hero, townsOf(state, hero.owner)))?.path;
}

/** Команда герою: пройти сегодняшнюю часть пути к цели. */
function heroCommand(state: GameState, hero: HeroState): Command | undefined {
  const path = goalPath(state, hero);
  const steps = path?.steps.slice(0, path.stepsToday) ?? [];
  if (steps.length === 0) {
    return undefined;
  }
  return accepted(state, { type: "moveHero", player: hero.owner, heroId: hero.id, path: steps });
}

/**
 * Выбор навыка за игрока: всегда первое предложение — повышение взятого навыка,
 * а если его нет — первый из новых (65-hero-skills.md). `undefined` — выбирать нечего.
 */
function skillChoice(state: GameState, player: number): Command | undefined {
  const hero = heroChoosingSkill(state, player);
  const skill = hero?.skillOffer[0];
  return hero === undefined || skill === undefined
    ? undefined
    : { type: "chooseSkill", player, heroId: hero.id, skill };
}

/**
 * Следующая команда на карте за игрока, чей сейчас ход, — кем бы он ни был.
 * Сначала города, потом герой; когда делать нечего — «закончить ход».
 */
export function chooseMapCommand(state: GameState): Command {
  const player = state.currentPlayer;
  const choice = skillChoice(state, player);
  if (choice !== undefined) {
    return choice;
  }
  const hero = state.heroes.find((candidate) => candidate.owner === player);
  const command = townCommand(state) ?? (hero === undefined ? undefined : heroCommand(state, hero));
  return command ?? { type: "endTurn", player };
}

/**
 * Следующая команда компьютера: на карте — если сейчас ход компьютерного игрока, в бою —
 * если ходит отряд охранника или компьютерного игрока. `undefined` — очередь человека
 * или партия окончена. Тот, кто ведёт партию, применяет команду и спрашивает снова.
 */
export function computerCommand(state: GameState): Command | undefined {
  if (state.outcome !== null) {
    return undefined;
  }
  if (state.battle !== null) {
    return guardBattleCommand(state);
  }
  // Навык компьютер выбирает сразу, и в чужой ход: уровень мог прийти за победу в обороне.
  for (const player of state.players) {
    const choice = player.kind === "computer" ? skillChoice(state, player.id) : undefined;
    if (choice !== undefined) {
      return choice;
    }
  }
  const current = state.players.find((player) => player.id === state.currentPlayer);
  return current?.kind === "computer" ? chooseMapCommand(state) : undefined;
}
