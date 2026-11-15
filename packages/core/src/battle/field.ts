/**
 * Заклинания поля боя: силовое поле, убрать препятствие, землетрясение, телепорт.
 * Спецификация: docs/mechanics/70-spells-field.md.
 */
import type { SpellDefinition } from "../spells.ts";
import { rollInt } from "./draft.ts";
import type { BattleDraft } from "./draft.ts";
import { immuneTo } from "./effects.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, cellIndex, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import { blockedCells } from "./queries.ts";
import type { BattleField } from "./queries.ts";
import { isInside, isMachine, isMoat, WALL_PARTS } from "./siege.ts";
import type { WallPart } from "./siege.ts";
import { enterMoat } from "./strike.ts";
import { build, springTrap, trapCount } from "./traps.ts";
import { buildable, forceFieldCells, seenFieldAt } from "./fieldCells.ts";
import type { BattleCommand, BattleRejectCode, BattleSide, StackState } from "./types.ts";

type CastCommand = Extract<BattleCommand, { type: "battleCast" }>;
type Refusal = { readonly code: BattleRejectCode; readonly message: string };

const FIELD_EFFECTS = [
  "forceField",
  "removeObstacle",
  "earthquake",
  "teleport",
  "fireWall",
  "quicksand",
  "mine",
] as const;
type FieldEffect = (typeof FIELD_EFFECTS)[number];

/** Сколько раундов стоит силовое поле: раунд, в котором наколдовано, и следующий. */
const FORCE_FIELD_ROUNDS = 2;

function fieldEffect(spell: SpellDefinition): FieldEffect | undefined {
  return FIELD_EFFECTS.find((effect) => effect === spell.effect);
}

/** Заклинание меняет поле, а не отряд. */
export function isFieldSpell(spell: SpellDefinition): boolean {
  return fieldEffect(spell) !== undefined;
}

/** Части укреплений, которые ещё стоят. */
function standingParts(state: BattleField): WallPart[] {
  const { siege } = state;
  return siege === null ? [] : WALL_PARTS.filter((part) => siege.health[part] > 0);
}

/**
 * Куда «Телепорт» уровня `tier` может перенести отряд: свободные клетки; в осаде без навыка —
 * по свою сторону стены и не в ров, с продвинутого уровня — и в ров, на экспертном — куда угодно.
 */
export function teleportCells(state: BattleField, stack: StackState, tier: number): Cell[] {
  const blocked = blockedCells(state, stack.side);
  const cells: Cell[] = [];
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      const cell = { col, row };
      const sameSide = isInside(cell) === isInside(stack);
      const allowed =
        state.siege === null ||
        tier >= 2 ||
        (sameSide && (tier >= 1 || !isMoat(state.siege, cell)));
      if (allowed && !blocked.has(cellIndex(cell))) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

/** Что можно убрать заклинанием уровня `tier` с клетки: препятствие или постройку. */
export function removableAt(
  state: BattleField,
  cell: Cell,
  tier: number,
  side: BattleSide,
): "obstacle" | "field" | undefined {
  if (state.obstacles.some((item) => sameCell(item, cell))) {
    return "obstacle";
  }
  // Скрытую ловушку врага убрать нельзя: о ней не знают.
  const built = seenFieldAt(state, cell, side);
  const enough = built?.kind === "fireWall" ? tier >= 1 : tier >= 2;
  return built !== undefined && enough ? "field" : undefined;
}

const BAD_CELL: BattleRejectCode = "BAD_SPELL_CELL";

/** Что мешает наколдовать заклинание поля; `null` — можно. Мана и герой уже проверены. */
export function fieldRefusal(
  state: BattleField,
  command: CastCommand,
  spell: SpellDefinition,
): Refusal | null {
  const { cell } = command;
  switch (fieldEffect(spell)) {
    case "earthquake":
      if (state.siege === null) {
        return { code: "NOT_A_SIEGE", message: `«${spell.name}» колдуют только в осаде.` };
      }
      return standingParts(state).length > 0
        ? null
        : { code: "BAD_SPELL_TARGET", message: "Ломать больше нечего." };
    case "forceField":
    case "fireWall": {
      const count = spell.effect === "fireWall" ? trapCount(spell) : spell.value;
      return cell !== undefined &&
        forceFieldCells(command.side, cell, count).every((item) =>
          buildable(state, item, command.side),
        )
        ? null
        : { code: BAD_CELL, message: `«${spell.name}» здесь не поставить: клетки заняты.` };
    }
    case "removeObstacle":
      return cell !== undefined && removableAt(state, cell, spell.value, command.side) !== undefined
        ? null
        : { code: BAD_CELL, message: "В этой клетке убирать нечего." };
    case "teleport": {
      const target = state.stacks.find((stack) => stack.id === command.target);
      if (target === undefined || target.count === 0) {
        return { code: "UNKNOWN_TARGET", message: `Отряда «${command.target ?? ""}» нет на поле.` };
      }
      if (target.side !== command.side || isMachine(target) || immuneTo(target, spell.level)) {
        return {
          code: "BAD_SPELL_TARGET",
          message: `«${spell.name}» переносит только свой отряд.`,
        };
      }
      const cells = teleportCells(state, target, spell.value);
      return cell !== undefined && cells.some((item) => sameCell(item, cell))
        ? null
        : { code: BAD_CELL, message: "В эту клетку отряд перенести нельзя." };
    }
    default:
      return null;
  }
}

function quake(draft: BattleDraft, hits: number): void {
  for (let hit = 0; hit < hits; hit += 1) {
    const { siege } = draft;
    const parts = standingParts(draft);
    const part = parts[rollInt(draft, 0, parts.length - 1)];
    if (siege === null || part === undefined) {
      return;
    }
    const left = siege.health[part] - 1;
    draft.siege = { ...siege, health: { ...siege.health, [part]: left } };
    draft.events.push({ type: "wallShaken", part, left });
  }
}

/** Колдует заклинание поля. Команда уже проверена, мана уже списана. */
export function castField(draft: BattleDraft, command: CastCommand, spell: SpellDefinition): void {
  const { cell } = command;
  const effect = fieldEffect(spell);
  if (effect === "earthquake") {
    quake(draft, spell.value);
    return;
  }
  if (cell === undefined) {
    return;
  }
  if (effect === "forceField") {
    const cells = forceFieldCells(command.side, cell, spell.value);
    build(draft, { kind: "forceField", cells, side: command.side, rounds: FORCE_FIELD_ROUNDS });
    draft.events.push({ type: "fieldPlaced", kind: "forceField", cells, side: command.side });
  } else if (effect === "removeObstacle") {
    if (removableAt(draft, cell, spell.value, command.side) === "obstacle") {
      draft.obstacles = draft.obstacles.filter((item) => !sameCell(item, cell));
      draft.events.push({ type: "obstacleRemoved", cell });
      return;
    }
    const found = seenFieldAt(draft, cell, command.side);
    const covers = (field: BattleDraft["fields"][number]): boolean => field === found;
    for (const field of draft.fields.filter(covers)) {
      draft.events.push({
        type: "fieldRemoved",
        kind: field.kind,
        cells: field.cells,
        reason: "removed",
      });
    }
    draft.fields = draft.fields.filter((field) => !covers(field));
  } else if (effect === "teleport") {
    const stack = draft.stacks.find((item) => item.id === command.target);
    if (stack === undefined) {
      return;
    }
    const from = { col: stack.col, row: stack.row };
    stack.col = cell.col;
    stack.row = cell.row;
    draft.events.push({ type: "stackTeleported", stackId: stack.id, from, to: cell });
    // Перенесённый отряд «сел» в клетку, как летающий: мина и стена огня срабатывают, пески — нет.
    springTrap(draft, stack, true);
    if (stack.count > 0) {
      enterMoat(draft, stack);
    }
  }
}

/** Начало раунда: срок построек убывает, истёкшие пропадают. */
export function startFieldRound(draft: BattleDraft): void {
  for (const field of draft.fields) {
    if (field.rounds === 1) {
      draft.events.push({
        type: "fieldRemoved",
        kind: field.kind,
        cells: field.cells,
        reason: "expired",
      });
    }
  }
  draft.fields = draft.fields
    .filter((field) => field.rounds !== 1)
    .map((field) => (field.rounds === 0 ? field : { ...field, rounds: field.rounds - 1 }));
}
