/**
 * Шестиугольное поле боя: клетки, соседи, расстояния.
 * Спецификация: docs/mechanics/10-battle-field.md.
 */
export const BATTLE_WIDTH = 15;
export const BATTLE_HEIGHT = 11;

/** Клетка поля: столбец и ряд с нуля. */
export interface Cell {
  readonly col: number;
  readonly row: number;
}

export function inField(cell: Cell): boolean {
  return cell.col >= 0 && cell.col < BATTLE_WIDTH && cell.row >= 0 && cell.row < BATTLE_HEIGHT;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

/** Номер клетки: удобен как ключ. */
export function cellIndex(cell: Cell): number {
  return cell.row * BATTLE_WIDTH + cell.col;
}

/**
 * Соседи клетки в пределах поля. Чётные ряды сдвинуты вправо: у клетки чётного ряда
 * соседи сверху и снизу — в своём столбце и в столбце правее, у нечётного — в своём и левее.
 */
export function neighbours(cell: Cell): Cell[] {
  const { col, row } = cell;
  const side = row % 2 === 0 ? col + 1 : col - 1;
  return [
    { col: col - 1, row },
    { col: col + 1, row },
    { col, row: row - 1 },
    { col: side, row: row - 1 },
    { col, row: row + 1 },
    { col: side, row: row + 1 },
  ].filter(inField);
}

/** Косая координата клетки: с ней расстояние считается простой формулой. */
function skewOf(cell: Cell): number {
  return cell.col - (cell.row + (cell.row % 2)) / 2;
}

/** Расстояние в клетках: сколько шагов по соседям между двумя клетками пустого поля. */
export function distance(a: Cell, b: Cell): number {
  const dq = skewOf(a) - skewOf(b);
  const dr = a.row - b.row;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}
