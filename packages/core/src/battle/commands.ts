/**
 * Применение команд боя и повтор боя.
 * Спецификация: docs/mechanics/12-battle-actions.md.
 */
import { toState } from "./create.ts";
import {
  applyDamage,
  attackOf,
  computeDamage,
  defendBonusOf,
  defenseOf,
  GOOD_DICE,
  halvingsOf,
  rollBaseDamage,
} from "./damage.ts";
import { cellIndex, distance, inField, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { findStack, hasAdjacentEnemy, isAlive, reachableCells } from "./queries.ts";
import { activateNext, endBattle, endIfDestroyed, rollChance } from "./turns.ts";
import type { BattleDraft } from "./turns.ts";
import type {
  BattleCommand,
  BattleCommandResult,
  BattleEvent,
  BattleRejectCode,
  BattleState,
  StackState,
  StrikeKind,
} from "./types.ts";

type DraftStack = BattleDraft["stacks"][number];

function reject(code: BattleRejectCode, message: string): BattleCommandResult {
  return { ok: false, code, message };
}

function toDraft(state: BattleState): BattleDraft {
  return {
    rng: state.rng,
    round: state.round,
    sides: state.sides,
    stacks: state.stacks.map((stack) => ({ ...stack })),
    activeStack: state.activeStack,
    lastActedSide: state.lastActedSide,
    result: state.result,
    events: [],
  };
}

function draftStack(draft: BattleDraft, id: string): DraftStack {
  const stack = draft.stacks.find((candidate) => candidate.id === id);
  if (stack === undefined) {
    throw new Error(`Отряда ${id} нет в бою.`);
  }
  return stack;
}

function moveTo(draft: BattleDraft, stack: DraftStack, to: Cell): void {
  if (sameCell(stack, to)) {
    return;
  }
  const from = { col: stack.col, row: stack.row };
  stack.col = to.col;
  stack.row = to.row;
  draft.events.push({
    type: "stackMoved",
    stackId: stack.id,
    from,
    to: { col: to.col, row: to.row },
  });
}

/** Один удар: жребий удачи, броски урона, потери цели. */
function strike(
  draft: BattleDraft,
  attacker: DraftStack,
  target: DraftStack,
  kind: StrikeKind,
): void {
  const side = draft.sides[attacker.side];
  const lucky = side.luck > 0 && rollChance(draft, side.luck, GOOD_DICE);
  const base = rollBaseDamage(draft.rng, attacker.creature, attacker.count);
  draft.rng = base.rng;

  const damage = computeDamage(
    base.value,
    attackOf(draft.sides, attacker),
    defenseOf(draft.sides, target),
    lucky,
    halvingsOf(kind, attacker, target),
  );

  const losses = applyDamage(target.count, target.firstHealth, target.creature.health, damage);
  target.count = losses.count;
  target.firstHealth = losses.firstHealth;
  draft.events.push({
    type: "strike",
    kind,
    attackerId: attacker.id,
    targetId: target.id,
    damage,
    killed: losses.killed,
    left: losses.count,
    lucky,
  });
  if (losses.count === 0) {
    target.turn = "done";
    draft.events.push({ type: "stackDied", stackId: target.id });
  }
}

/**
 * Заканчивает действие отряда (перемещение, удар, выстрел): проверяет конец боя,
 * бросает жребий второго хода и, если его нет, передаёт ход дальше.
 */
function finishAction(draft: BattleDraft, stack: DraftStack): void {
  if (endIfDestroyed(draft)) {
    return;
  }
  const morale = draft.sides[stack.side].morale;
  if (stack.count > 0 && !stack.moraleUsed && morale > 0 && rollChance(draft, morale, GOOD_DICE)) {
    // Второй ход: отряд остаётся активным. Третьего хода в этом раунде не будет.
    stack.moraleUsed = true;
    draft.events.push({ type: "moraleTurn", stackId: stack.id });
    return;
  }
  stack.turn = "done";
  activateNext(draft);
}

function accept(state: BattleState, draft: BattleDraft): BattleCommandResult {
  return { ok: true, state: toState(draft, state.obstacles), events: draft.events };
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
  return accept(state, draft);
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
  if (target.side === active.side) {
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
  strike(draft, stack, victim, "melee");
  // Отвечают только выжившие и только раз за раунд.
  if (victim.count > 0 && !victim.retaliated) {
    victim.retaliated = true;
    strike(draft, victim, stack, "retaliation");
  }
  finishAction(draft, stack);
  return accept(state, draft);
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
  if (hasAdjacentEnemy(state, active)) {
    return reject("ENEMY_ADJACENT", "Рядом враг: стрелять нельзя.");
  }
  const draft = toDraft(state);
  const stack = draftStack(draft, active.id);
  stack.shots -= 1;
  strike(draft, stack, draftStack(draft, target.id), "shot");
  finishAction(draft, stack);
  return accept(state, draft);
}

function applyWait(state: BattleState, active: StackState): BattleCommandResult {
  if (active.turn !== "ready") {
    return reject("ALREADY_WAITED", "Отряд уже ждал в этом раунде.");
  }
  const draft = toDraft(state);
  const stack = draftStack(draft, active.id);
  // Ожидание во время второго хода от боевого духа — отдельная часть раунда.
  stack.turn = stack.moraleUsed ? "waitingAfterMorale" : "waiting";
  draft.events.push({ type: "stackWaits", stackId: stack.id });
  activateNext(draft);
  return accept(state, draft);
}

function applyDefend(state: BattleState, active: StackState): BattleCommandResult {
  const draft = toDraft(state);
  const stack = draftStack(draft, active.id);
  const heroDefense = draft.sides[stack.side].hero?.defense ?? 0;
  stack.defendBonus = defendBonusOf(stack.creature.defense + heroDefense);
  stack.turn = "done";
  draft.events.push({ type: "stackDefends", stackId: stack.id, bonus: stack.defendBonus });
  activateNext(draft);
  return accept(state, draft);
}

function applyFlee(state: BattleState, active: StackState): BattleCommandResult {
  if (state.sides[active.side].hero === null) {
    return reject("NO_HERO", "Бежать некому: у стороны нет героя.");
  }
  const draft = toDraft(state);
  draft.events.push({ type: "sideFled", side: active.side });
  endBattle(draft, active.side === 0 ? 1 : 0, "fled");
  return accept(state, draft);
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
  if (command.side !== active.side) {
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
      return applyFlee(state, active);
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
