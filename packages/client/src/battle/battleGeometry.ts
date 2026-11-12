/**
 * Геометрия поля боя на экране: размер клетки под экран, центры клеток, клетка под пальцем.
 * Без Phaser, чтобы проверять тестами. Спецификация: docs/mechanics/16-battle-screen.md.
 */
import { BATTLE_HEIGHT, BATTLE_WIDTH } from "@homamru/core";
import type { Cell } from "@homamru/core";

const SQRT3 = Math.sqrt(3);
/** Поле в ширинах клетки: 15 клеток и полклетки сдвига чётных рядов. */
const WIDTH_IN_CELLS = BATTLE_WIDTH + 0.5;
/** Поле в «радиусах» клетки: ряды идут с шагом в полтора радиуса. */
const HEIGHT_IN_RADII = (BATTLE_HEIGHT - 1) * 1.5 + 2;
/**
 * Насколько клетку можно растянуть в ширину на низком экране. Нужно, чтобы на телефоне
 * клетка была не уже 44 пикселей (бюджет в stage-2.md): поле упирается в высоту экрана.
 */
const MAX_STRETCH = 1.6;

/** Место под поле на экране. */
interface Area {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BattleLayout {
  /** Ширина клетки. */
  readonly cellWidth: number;
  /** Расстояние от центра клетки до верхнего угла. */
  readonly radius: number;
  /** Левый верхний угол поля. */
  readonly x: number;
  readonly y: number;
}

/** Подбирает размер клетки так, чтобы поле целиком поместилось в отведённое место. */
export function layoutOf(area: Area): BattleLayout {
  let radius = area.height / HEIGHT_IN_RADII;
  let cellWidth = area.width / WIDTH_IN_CELLS;
  // Клетка не выше правильного шестиугольника и не шире его больше чем в MAX_STRETCH раз.
  radius = Math.min(radius, cellWidth / SQRT3);
  cellWidth = Math.min(cellWidth, radius * SQRT3 * MAX_STRETCH);
  return {
    cellWidth,
    radius,
    x: area.x + (area.width - cellWidth * WIDTH_IN_CELLS) / 2,
    y: area.y + (area.height - radius * HEIGHT_IN_RADII) / 2,
  };
}

/** Центр клетки на экране. Чётные ряды сдвинуты вправо на полклетки. */
export function cellCenter(layout: BattleLayout, cell: Cell): { x: number; y: number } {
  const shift = cell.row % 2 === 0 ? 0.5 : 0;
  return {
    x: layout.x + (cell.col + 0.5 + shift) * layout.cellWidth,
    y: layout.y + (1 + cell.row * 1.5) * layout.radius,
  };
}

/** Шесть углов клетки, начиная с верхнего, по часовой стрелке. */
export function cellCorners(layout: BattleLayout, cell: Cell): { x: number; y: number }[] {
  const { x, y } = cellCenter(layout, cell);
  const half = layout.cellWidth / 2;
  const r = layout.radius;
  return [
    { x, y: y - r },
    { x: x + half, y: y - r / 2 },
    { x: x + half, y: y + r / 2 },
    { x, y: y + r },
    { x: x - half, y: y + r / 2 },
    { x: x - half, y: y - r / 2 },
  ];
}

/** Клетка под точкой экрана; `null`, если точка вне поля. */
export function cellAt(layout: BattleLayout, x: number, y: number): Cell | null {
  // По вертикали растягиваем до правильного шестиугольника: тогда клетка точки — ближайший центр.
  const scale = layout.cellWidth / (SQRT3 * layout.radius);
  let best: Cell | null = null;
  let bestDistance = Infinity;
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      const center = cellCenter(layout, { col, row });
      const distance = Math.hypot(x - center.x, (y - center.y) * scale);
      if (distance < bestDistance) {
        best = { col, row };
        bestDistance = distance;
      }
    }
  }
  // Дальше угла клетки от ближайшего центра — значит, за краем поля.
  return bestDistance <= layout.cellWidth / SQRT3 ? best : null;
}
