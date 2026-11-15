/**
 * Применение команд боя и повтор боя.
 * Спецификация: docs/mechanics/12-battle-actions.md.
 */
import { cast, castRefusal } from "./cast.ts";
import { rollChance, toDraft, toState } from "./draft.ts";
import type { BattleDraft } from "./draft.ts";
import { calmDown } from "./control.ts";
import { defendBonusOf, GOOD_DICE } from "./damage.ts";
import { commanderOf, forgotShooting, moraleOf } from "./effects.ts";
import { cellIndex, distance, inField, sameCell } from "./hex.ts";
import { findStack, hasAdjacentEnemy, isAlive, reachableCells } from "./queries.ts";
import { exchange, moveTo, strike } from "./strike.ts";
import { activateNext, endAfterCast, endBattle, endIfDestroyed } from "./turns.ts";
import type {
  BattleCommand,
  BattleCommandResult,
  BattleEvent,
  BattleRejectCode,
  BattleSide,
  BattleState,
  StackState,
} from "./types.ts";

type DraftStack = BattleDraft["stacks"][number];

function reject(code: BattleRejectCode, message: string): BattleCommandResult {
  return { ok: false, code, message };
}

function draftStack(draft: BattleDraft, id: string): DraftStack {
  const stack = draft.stacks.find((candidate) => candidate.id === id);
  if (stack === undefined) {
    throw new Error(`Отряда ${id} нет в бою.`);
  }
  return stack;
}

/**
 * Заканчивает действие отряда (перемещение, удар, выстрел): проверяет конец боя,
 * бросает жребий второго хода и, если его нет, передаёт ход дальше.
 */
function finishAction(draft: BattleDraft, stack: DraftStack): void {
  calmDown(draft, stack);
  if (endIfDestroyed(draft)) {
    return;
  }
  const morale = moraleOf(draft, stack);
  if (stack.count > 0 && !stack.moraleUsed && morale > 0 && rollChance(draft, morale, GOOD_DICE)) {
    // Второй ход: отряд остаётся активным. Третьего хода в этом раунде не будет.
    stack.moraleUsed = true;
    draft.events.push({ type: "moraleTurn", stackId: stack.id });
    return;
  }
  stack.turn = "done";
  activateNext(draft);
}

function accept(draft: BattleDraft): BattleCommandResult {
  return { ok: true, state: toState(draft), events: draft.events };
}

function applyMove(
  state: BattleState,
  active: StackState,
  command: Extract<BattleCommand, { type: "battleMove" }>,
): BattleCommandResult {
  if (!inField(command.to) || !reachableCells(state, active).has(cellIndex(command.to))) {
    return reject("CELL_UNREACHABLE", "Отряд не может встать на эту клетку.");
  }
  const draft = toDraft(state);
  const stack = draftStack(draft, active.id);
  moveTo(draft, stack, command.to);
  finishAction(draft, stack);
  return accept(draft);
}

/** Проверки цели, общие для удара и выстрела. */
function checkTarget(
  state: BattleState,
  active: StackState,
  targetId: string,
): StackState | BattleCommandResult {
  const target = findStack(state, targetId);
  if (target === undefined || !isAlive(target)) {
    return reject("UNKNOWN_TARGET", `Отряда «${targetId}» нет на поле.`);
  }
  if (commanderOf(target) === commanderOf(active)) {
    return reject("TARGET_IS_ALLY", "Нельзя бить свой отряд.");
  }
  return target;
}

function applyAttack(
  state: BattleState,
  active: StackState,
  command: Extract<BattleCommand, { type: "battleAttack" }>,
): BattleCommandResult {
  const target = checkTarget(state, active, command.target);
  if ("ok" in target) {
    return target;
  }
  const { from } = command;
  if (!inField(from) || distance(from, target) !== 1) {
    return reject("NOT_ADJACENT", "Клетка удара не соседняя с целью.");
  }
  if (!sameCell(from, active) && !reachableCells(state, active).has(cellIndex(from))) {
    return reject("CELL_UNREACHABLE", "Отряд не может встать на клетку удара.");
  }
  const draft = toDraft(state);
  const stack = draftStack(draft, active.id);
  const victim = draftStack(draft, target.id);
  moveTo(draft, stack, from);
  if (stack.count === 0) {
    // Погиб во рву, не дойдя до удара.
    finishAction(draft, stack);
    return accept(draft);
  }
  exchange(draft, stack, victim);
  finishAction(draft, stack);
  return accept(draft);
}

function applyShoot(
  state: BattleState,
  active: StackState,
  command: Extract<BattleCommand, { type: "battleShoot" }>,
): BattleCommandResult {
  const target = checkTarget(state, active, command.target);
  if ("ok" in target) {
    return target;
  }
  if (active.creature.shots === 0) {
    return reject("NOT_A_SHOOTER", "Это существо не стреляет.");
  }
  if (active.shots === 0) {
    return reject("NO_SHOTS", "Выстрелы кончились.");
  }
  if (forgotShooting(active)) {
    return reject("NO_SHOTS", "Отряд забыл, как стрелять: на нём «Забывчивость».");
  }
  if (hasAdjacentEnemy(state, active)) {
    return reject("ENEMY_ADJACENT", "Рядом враг: стрелять нельзя.");
  }
  const draft = toDraft(state);
  const stack = draftStack(draft, active.id);
  stack.shots -= 1;
  strike(draft, stack, draftStack(draft, target.id), "shot");
  finishAction(draft, stack);
  return accept(draft);
}

function applyWait(state: BattleState, active: StackState): BattleCommandResult {
  if (active.turn !== "ready") {
    return reject("ALREADY_WAITED", "Отряд уже ждал в этом раунде.");
  }
  const draft = toDraft(state);
  const stack = draftStack(draft, active.id);
  // Ожидание во время второго хода от боевого духа — отдельная часть раунда.
  calmDown(draft, stack);
  stack.turn = stack.moraleUsed ? "waitingAfterMorale" : "waiting";
  draft.events.push({ type: "stackWaits", stackId: stack.id });
  activateNext(draft);
  return accept(draft);
}

function applyDefend(state: BattleState, active: StackState): BattleCommandResult {
  const draft = toDraft(state);
  const stack = draftStack(draft, active.id);
  const heroDefense = draft.sides[stack.side].hero?.defense ?? 0;
  stack.defendBonus = defendBonusOf(stack.creature.defense + heroDefense);
  calmDown(draft, stack);
  stack.turn = "done";
  draft.events.push({ type: "stackDefends", stackId: stack.id, bonus: stack.defendBonus });
  activateNext(draft);
  return accept(draft);
}

function applyFlee(state: BattleState, side: BattleSide): BattleCommandResult {
  if (state.sides[side].hero === null) {
    return reject("NO_HERO", "Бежать некому: у стороны нет героя.");
  }
  const draft = toDraft(state);
  draft.events.push({ type: "sideFled", side });
  endBattle(draft, side === 0 ? 1 : 0, "fled");
  return accept(draft);
}

/** Заклинание героя: ход отряда не тратится. */
function applyCast(
  state: BattleState,
  command: Extract<BattleCommand, { type: "battleCast" }>,
): BattleCommandResult {
  const refusal = castRefusal(state, command);
  if (refusal !== null) {
    return reject(refusal.code, refusal.message);
  }
  const draft = toDraft(state);
  cast(draft, command);
  endAfterCast(draft);
  return accept(draft);
}

/**
 * Применяет команду боя: новое состояние и события либо отказ.
 * Переданное состояние не меняется. Отказ не тратит случайных чисел.
 */
export function applyBattleCommand(
  state: BattleState,
  command: BattleCommand,
): BattleCommandResult {
  const active = state.activeStack === null ? undefined : findStack(state, state.activeStack);
  if (state.result !== null || active === undefined) {
    return reject("BATTLE_OVER", "Бой уже закончен.");
  }
  // Отрядом под гипнозом командует другая сторона (69-spells-control.md).
  if (command.side !== commanderOf(active)) {
    return reject("NOT_YOUR_STACK", "Сейчас ход отряда другой стороны.");
  }
  switch (command.type) {
    case "battleMove":
      return applyMove(state, active, command);
    case "battleAttack":
      return applyAttack(state, active, command);
    case "battleShoot":
      return applyShoot(state, active, command);
    case "battleWait":
      return applyWait(state, active);
    case "battleDefend":
      return applyDefend(state, active);
    case "battleFlee":
      return applyFlee(state, command.side);
    case "battleCast":
      return applyCast(state, command);
  }
}

export type BattleReplayResult =
  | { readonly ok: true; readonly state: BattleState; readonly events: readonly BattleEvent[] }
  | { readonly ok: false; readonly commandIndex: number; readonly code: BattleRejectCode };

/** Повторяет бой: применяет команды по очереди. Отказ — признак расхождения. */
export function replayBattle(
  initial: BattleState,
  commands: readonly BattleCommand[],
): BattleReplayResult {
  let state = initial;
  const events: BattleEvent[] = [];
  for (const [commandIndex, command] of commands.entries()) {
    const result = applyBattleCommand(state, command);
    if (!result.ok) {
      return { ok: false, commandIndex, code: result.code };
    }
    state = result.state;
    events.push(...result.events);
  }
  return { ok: true, state, events };
}
