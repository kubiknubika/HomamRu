/**
 * Что подсветить на поле боя: клетки и обводки отрядов. Только решает, что показать;
 * рисует сцена. Без Phaser, чтобы проверять тестами.
 * Спецификация: docs/mechanics/16-battle-screen.md.
 */
import {
  activeStackOf,
  findStack,
  isFieldSpell,
  isLifeSpell,
  reachableCells,
  walkRoute,
} from "@homamru/core";
import type { Cell, StackState } from "@homamru/core";
import { areaHits, areaMarks } from "./battleArea.ts";
import { fieldMarks, teleportStacks } from "./battleField.ts";
import { attackableTargets, playerStack } from "./battleSession.ts";
import { lifeGhosts, lifeTargets, lifeVictims } from "./battleLife.ts";
import { spellTargets } from "./battleSpells.ts";
import type { BattleSnapshot } from "./battleSession.ts";

type CellMark =
  /** Сюда может пойти отряд игрока. */
  | "reach"
  /** Сюда может пойти отряд, который игрок рассматривает. */
  | "otherReach"
  /** Сюда могут пойти оба. */
  | "overlap"
  /** Клетка пути, которым отряд пойдёт в выбранную клетку. */
  | "path"
  /** Клетка, выбранная для хода. */
  | "moveChoice"
  /** Клетка, с которой можно ударить выбранного врага. */
  | "attackCell"
  /** Клетка, выбранная для удара. */
  | "attackChoice"
  /** Клетка под заклинанием по площади. */
  | "spellArea";

type RingMark =
  /** Отряд, чей ход. */
  | "active"
  /** Враг, которого можно ударить или обстрелять. */
  | "attackable"
  /** Выбранный враг. */
  | "target"
  /** Чужой отряд, на который ляжет выбранное заклинание. */
  | "spellEnemy"
  /** Свой отряд, на который ляжет выбранное заклинание. */
  | "spellAlly"
  /** Свой отряд, который заденет заклинание по площади. */
  | "spellOwn"
  /** Отряд, который игрок рассматривает. */
  | "inspected";

export interface Highlights {
  readonly cells: readonly { readonly cell: Cell; readonly mark: CellMark }[];
  readonly rings: readonly { readonly stack: StackState; readonly mark: RingMark }[];
}

function keyOf(cell: Cell): string {
  return `${cell.col},${cell.row}`;
}

/** Погибшие отряды, которые видны бледными значками: их можно поднять выбранным заклинанием. */
export function ghostIds(snapshot: BattleSnapshot): ReadonlySet<string> {
  const { selection, state, playerSide } = snapshot;
  const spell =
    selection?.kind === "spell"
      ? state.sides[playerSide].hero?.spells.find((item) => item.id === selection.spell)
      : undefined;
  const ghosts = spell === undefined ? [] : lifeGhosts(state, playerSide, spell);
  return new Set(ghosts.map((stack) => stack.id));
}

export function highlightsOf(snapshot: BattleSnapshot): Highlights {
  const { state, selection } = snapshot;
  const marks = new Map<string, { cell: Cell; mark: CellMark }>();
  const rings: { stack: StackState; mark: RingMark }[] = [];
  const put = (cell: Cell, mark: CellMark): void => {
    marks.set(keyOf(cell), { cell, mark });
  };

  const active = activeStackOf(state);
  if (active !== undefined) {
    rings.push({ stack: active, mark: "active" });
  }
  const me = playerStack(snapshot);
  if (selection?.kind === "spell") {
    // Выбрано заклинание: видны только отряды, на которые оно ложится.
    const hero = state.sides[snapshot.playerSide].hero;
    const spell = hero?.spells.find((item) => item.id === selection.spell);
    if (spell !== undefined && isLifeSpell(spell)) {
      // Заклинание жизни: кого можно поднять или клонировать; у «Жертвы» потом — кого отдать.
      const victims = lifeVictims(state, snapshot.playerSide, spell, selection.targetId);
      const first = victims.length > 0 ? [] : lifeTargets(state, snapshot.playerSide, spell);
      const given = selection.aim?.victim;
      for (const stack of [...first, ...victims]) {
        const chosen = stack.id === selection.targetId || stack.id === given;
        rings.push({
          stack,
          mark: chosen ? "target" : first.length > 0 ? "spellAlly" : "spellOwn",
        });
      }
      const raisedOne = state.stacks.find((stack) => stack.id === selection.targetId);
      if (victims.length > 0 && raisedOne !== undefined) {
        rings.push({ stack: raisedOne, mark: "target" });
      }
      return { cells: [], rings };
    }
    if (spell !== undefined && isFieldSpell(spell)) {
      // Заклинание поля: клетки, куда оно ляжет; у «Телепорта» — ещё и отряды, которые можно перенести.
      const cells = fieldMarks(state, snapshot.playerSide, spell, selection).map((cell) => ({
        cell,
        mark: "spellArea" as const,
      }));
      if (spell.effect === "teleport") {
        for (const stack of teleportStacks(state, snapshot.playerSide, spell)) {
          rings.push({ stack, mark: stack.id === selection.targetId ? "target" : "spellAlly" });
        }
      }
      return { cells, rings };
    }
    if (spell?.area !== undefined && selection.aim) {
      // Заклинание по площади направлено: клетки под ним и все, кого оно заденет.
      for (const stack of areaHits(state, spell, selection.aim)) {
        rings.push({ stack, mark: stack.side === snapshot.playerSide ? "spellOwn" : "spellEnemy" });
      }
      const cells = areaMarks(spell, selection.aim).map((cell) => ({
        cell,
        mark: "spellArea" as const,
      }));
      return { cells, rings };
    }
    const targets = spell === undefined ? [] : spellTargets(state, snapshot.playerSide, spell);
    for (const stack of targets) {
      const mark = stack.side === snapshot.playerSide ? "spellAlly" : "spellEnemy";
      // Заклинание «на всех»: выбраны сразу все его цели.
      const chosen =
        spell?.mass === true ? selection.targetId !== null : stack.id === selection.targetId;
      rings.push({ stack, mark: chosen ? "target" : mark });
    }
    return { cells: [], rings };
  }
  if (me !== undefined) {
    for (const cell of reachableCells(state, me).values()) {
      put(cell, "reach");
    }
  }
  const inspected = snapshot.inspected === null ? undefined : findStack(state, snapshot.inspected);
  if (inspected !== undefined && inspected.count > 0 && inspected.id !== me?.id) {
    rings.push({ stack: inspected, mark: "inspected" });
    for (const cell of reachableCells(state, inspected).values()) {
      put(cell, marks.has(keyOf(cell)) ? "overlap" : "otherReach");
    }
  }
  for (const enemy of attackableTargets(snapshot)) {
    rings.push({ stack: enemy, mark: "attackable" });
  }
  if (me === undefined || selection === null) {
    return { cells: [...marks.values()], rings };
  }
  // Путь до хода: тот же, каким отряд пойдёт (70-spells-field.md). У летающего пути по клеткам нет.
  const showPath = (to: Cell): void => {
    for (const cell of walkRoute(state, me, to).slice(0, -1)) {
      put(cell, "path");
    }
  };
  if (selection.kind === "move") {
    showPath(selection.cell);
    put(selection.cell, "moveChoice");
    return { cells: [...marks.values()], rings };
  }
  const target = findStack(state, selection.targetId);
  if (target !== undefined) {
    rings.push({ stack: target, mark: "target" });
  }
  if (selection.kind === "attack") {
    for (const cell of selection.cells) {
      put(cell, "attackCell");
    }
    if (selection.from !== null) {
      showPath(selection.from);
      put(selection.from, "attackChoice");
    }
  }
  return { cells: [...marks.values()], rings };
}
