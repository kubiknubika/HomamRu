/**
 * Ловушки на поле боя: зыбучие пески, мины, стена огня — как ставятся и что делают с отрядом.
 * Спецификация: docs/mechanics/70-spells-field.md.
 */
import type { SpellDefinition } from "../spells.ts";
import { wound } from "./damage.ts";
import { rollInt } from "./draft.ts";
import type { BattleDraft } from "./draft.ts";
import { immuneTo, spellDamagePercent } from "./effects.ts";
import { buildable, forceFieldCells } from "./fieldCells.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, sameCell } from "./hex.ts";
import type { Cell } from "./hex.ts";
import type { BattleHero, BattleSide, FieldObject } from "./types.ts";

type DraftStack = BattleDraft["stacks"][number];
type CastCommand = { readonly side: BattleSide; readonly cell?: Cell | undefined };

const TRAP_EFFECTS = ["fireWall", "quicksand", "mine"] as const;
type TrapEffect = (typeof TRAP_EFFECTS)[number];

/** Сколько раундов стоит стена огня: раунд, в котором наколдована, и следующий. */
const FIRE_WALL_ROUNDS = 2;
/** Срок «до конца боя». */
const FOREVER = 0;

function trapEffect(spell: SpellDefinition): TrapEffect | undefined {
  return TRAP_EFFECTS.find((effect) => effect === spell.effect);
}

/** Заклинание ставит ловушку: пески, мины или стену огня. */
export function isTrapSpell(spell: SpellDefinition): boolean {
  return trapEffect(spell) !== undefined;
}

/** Сколько клеток займёт постройка заклинания у этого героя. */
export function trapCount(spell: SpellDefinition): number {
  return spell.chainLength ?? spell.chain?.[0] ?? 1;
}

/** Урон мины или стены огня: множитель × сила магии + прибавка, с «Волшебством». */
export function trapDamage(
  spell: SpellDefinition,
  hero: Pick<BattleHero, "spellPower" | "sorcery">,
): number {
  const raw = spell.power * hero.spellPower + spell.value;
  return Math.floor((raw * (100 + hero.sorcery)) / 100);
}

/** Убирает скрытые ловушки врага, поверх которых встала новая постройка. */
function replaceHidden(draft: BattleDraft, cells: readonly Cell[]): void {
  const covered = (field: FieldObject): boolean =>
    field.cells.some((item) => cells.some((cell) => sameCell(item, cell)));
  for (const field of draft.fields.filter(covered)) {
    draft.events.push({
      type: "fieldRemoved",
      kind: field.kind,
      cells: field.cells,
      reason: "removed",
    });
  }
  draft.fields = draft.fields.filter((field) => !covered(field));
}

/** Ставит постройку на клетки; скрытые ловушки врага под ней пропадают. */
export function build(draft: BattleDraft, field: FieldObject): void {
  replaceHidden(draft, field.cells);
  draft.fields = [...draft.fields, field];
}

/** Случайные клетки под пески и мины: из подходящих для постройки, без повторов. */
function randomCells(draft: BattleDraft, side: BattleSide, count: number): Cell[] {
  const free: Cell[] = [];
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      if (buildable(draft, { col, row }, side)) {
        free.push({ col, row });
      }
    }
  }
  const cells: Cell[] = [];
  while (cells.length < count && free.length > 0) {
    const [cell] = free.splice(rollInt(draft, 0, free.length - 1), 1);
    if (cell !== undefined) {
      cells.push(cell);
    }
  }
  return cells;
}

/** Колдует пески, мины или стену огня. Команда уже проверена, мана уже списана. */
export function castTrap(
  draft: BattleDraft,
  command: CastCommand,
  spell: SpellDefinition,
  hero: Pick<BattleHero, "spellPower" | "sorcery">,
): void {
  const { side } = command;
  const effect = trapEffect(spell);
  if (effect === undefined) {
    return;
  }
  if (effect === "fireWall") {
    if (command.cell === undefined) {
      return;
    }
    const cells = forceFieldCells(side, command.cell, trapCount(spell));
    const damage = trapDamage(spell, hero);
    build(draft, {
      kind: "fireWall",
      cells,
      side,
      rounds: FIRE_WALL_ROUNDS,
      damage,
      level: spell.level,
    });
    draft.events.push({ type: "fieldPlaced", kind: "fireWall", cells, side });
    return;
  }
  const cells = randomCells(draft, side, trapCount(spell));
  for (const cell of cells) {
    // Каждая клетка — своя постройка: мина взрывается одна, пески открываются по одной клетке.
    build(
      draft,
      effect === "mine"
        ? {
            kind: "mine",
            cells: [cell],
            side,
            rounds: FOREVER,
            hidden: true,
            damage: trapDamage(spell, hero),
            level: spell.level,
          }
        : { kind: "quicksand", cells: [cell], side, rounds: FOREVER, hidden: true },
    );
  }
  draft.events.push({ type: "fieldPlaced", kind: effect, cells, side });
}

function hurt(draft: BattleDraft, stack: DraftStack, field: FieldObject, cell: Cell): void {
  const damage = Math.floor(((field.damage ?? 0) * spellDamagePercent(stack, ["fire"])) / 100);
  const losses = wound(stack, damage);
  draft.events.push({
    type: "trapDamage",
    kind: field.kind === "mine" ? "mine" : "fireWall",
    stackId: stack.id,
    cell,
    damage,
    killed: losses.killed,
    left: losses.count,
  });
  if (losses.count === 0) {
    draft.events.push({ type: "stackDied", stackId: stack.id });
  }
}

/**
 * Отряд вошёл в клетку (летающий или перенесённый — сел в неё): срабатывает ловушка, если она там есть.
 * Ответ `true` — отряд увяз в песках и дальше не идёт.
 */
export function springTrap(
  draft: BattleDraft,
  stack: DraftStack,
  flying = stack.creature.flying,
): boolean {
  const cell = { col: stack.col, row: stack.row };
  const field = draft.fields.find((item) => item.cells.some((at) => sameCell(at, cell)));
  if (field === undefined || field.kind === "forceField") {
    return false;
  }
  if (field.kind === "quicksand") {
    if (flying) {
      return false;
    }
    // Увязший отряд открывает пески всем.
    draft.fields = draft.fields.map((item) =>
      item === field
        ? { kind: item.kind, cells: item.cells, side: item.side, rounds: item.rounds }
        : item,
    );
    draft.events.push({ type: "stackStuck", stackId: stack.id, cell });
    return true;
  }
  if (immuneTo(stack, field.level ?? 0)) {
    return false;
  }
  if (field.kind === "mine") {
    if (field.side === stack.side) {
      return false;
    }
    draft.fields = draft.fields.filter((item) => item !== field);
    draft.events.push({
      type: "fieldRemoved",
      kind: "mine",
      cells: field.cells,
      reason: "exploded",
    });
  }
  hurt(draft, stack, field, cell);
  return false;
}

/** Отряд закончил ход, стоя в стене огня: она жжёт его ещё раз. Ответ — погиб ли отряд. */
export function scorch(draft: BattleDraft, stack: DraftStack): boolean {
  const field = draft.fields.find(
    (item) => item.kind === "fireWall" && item.cells.some((at) => sameCell(at, stack)),
  );
  if (field !== undefined && !immuneTo(stack, field.level ?? 0)) {
    hurt(draft, stack, field, { col: stack.col, row: stack.row });
  }
  return stack.count === 0;
}
