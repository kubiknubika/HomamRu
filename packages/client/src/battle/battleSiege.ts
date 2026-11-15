/**
 * Осада на экране боя: что нарисовать на поле и что сказать словами.
 * Правил здесь нет — всё берётся из ядра. Спецификация: docs/mechanics/51-siege-screen.md.
 */
import {
  findStack,
  GATE_INNER,
  GATE_OUTER,
  gateOpen,
  hasWallPenalty,
  isMoat,
  MOAT_DAMAGE,
  MOAT_DEFENSE,
  wallCells,
  wallPartCell,
} from "@homamru/core";
import type { BattleEvent, BattleState, Cell, StackState, Tower, WallPart } from "@homamru/core";

/** Вид клетки поля. */
export type CellLook =
  | "field"
  | "obstacle"
  | "forceField"
  | "fireWall"
  | "quicksand"
  | "mine"
  | "wall"
  | "segment"
  | "cracked"
  | "gate"
  | "gateOpen"
  | "moat";

const SEGMENTS = ["wall1", "wall2", "wall3", "wall4"] as const;

/**
 * Где нарисованы башни — там же, где на картинке осады в Heroes 3 (сверено по VCMI,
 * `config/factions/castle.json`, `siege.towers`): верхняя — у верхнего конца стены, нижняя — у нижнего,
 * сразу за стеной, главная — у правого края поля. На правила не влияет: башня клетку не занимает,
 * отряд может стоять поверх неё.
 */
export const TOWER_CELLS: Readonly<Record<Tower, Cell>> = {
  upperTower: { col: 11, row: 0 },
  keep: { col: 14, row: 3 },
  lowerTower: { col: 12, row: 10 },
};

const TOWER_NAMES: Readonly<Record<Tower, string>> = {
  keep: "Главная башня",
  upperTower: "Верхняя башня",
  lowerTower: "Нижняя башня",
};

function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

/** Участок стены в этой клетке, целый или разрушенный. */
function segmentAt(cell: Cell): (typeof SEGMENTS)[number] | undefined {
  return SEGMENTS.find((part) => {
    const at = wallPartCell(part);
    return at !== null && sameCell(at, cell);
  });
}

function isGate(cell: Cell): boolean {
  return sameCell(cell, GATE_OUTER) || sameCell(cell, GATE_INNER);
}

/** Как выглядит клетка: препятствие, стена, участок (целый или с прочностью 1), ворота, ров. */
/**
 * Постройка в клетке, которую игрок видит: свою — всегда, чужие пески и мины — только открытые
 * (70-spells-field.md).
 */
function fieldAt(state: BattleState, cell: Cell, playerSide: 0 | 1) {
  return state.fields.find(
    (field) =>
      (field.hidden !== true || field.side === playerSide) &&
      field.cells.some((item) => sameCell(item, cell)),
  );
}

export function cellLook(state: BattleState, cell: Cell, playerSide: 0 | 1 = 0): CellLook {
  const { siege } = state;
  if (state.obstacles.some((obstacle) => sameCell(obstacle, cell))) {
    return "obstacle";
  }
  const built = fieldAt(state, cell, playerSide);
  if (built !== undefined) {
    return built.kind;
  }
  if (siege === null) {
    return "field";
  }
  const segment = segmentAt(cell);
  if (segment !== undefined && siege.health[segment] > 0) {
    return siege.health[segment] === 1 ? "cracked" : "segment";
  }
  if (wallCells(siege).some((wall) => sameCell(wall, cell))) {
    return "wall";
  }
  if (isGate(cell) && siege.health.gate > 0) {
    return gateOpen(siege, state.stacks) ? "gateOpen" : "gate";
  }
  return isMoat(siege, cell) ? "moat" : "field";
}

export interface TowerMark {
  readonly tower: Tower;
  readonly cell: Cell;
}

const TOWERS: readonly Tower[] = ["keep", "upperTower", "lowerTower"];

/** Башни, которые стоят. Разрушенная башня с поля пропадает; в форте башен нет. */
export function towerMarks(state: BattleState): TowerMark[] {
  const { siege } = state;
  return siege === null
    ? []
    : TOWERS.filter((tower) => siege.health[tower] > 0).map((tower) => ({
        tower,
        cell: TOWER_CELLS[tower],
      }));
}

/** Откуда летит выстрел башни и куда — выстрел катапульты: клетка для показа. */
export function partCell(part: WallPart): Cell {
  return wallPartCell(part) ?? TOWER_CELLS[part as Tower];
}

function damageText(low: number): string {
  return `${low}–${2 * low}`;
}

/** Что сказать про клетку осады по удержанию пальца; `null` — клетка обычная. */
function fieldNote(field: BattleState["fields"][number], playerSide: 0 | 1): string {
  const whose = field.side === playerSide ? "ваша" : "чужая";
  switch (field.kind) {
    case "forceField":
      return `Силовое поле: встать нельзя. Осталось раундов: ${field.rounds}.`;
    case "fireWall":
      return `Стена огня: жжёт любой отряд, вошедший в клетку, урон ${field.damage ?? 0}. Осталось раундов: ${field.rounds}.`;
    case "quicksand":
      return field.hidden === true
        ? "Зыбучие пески (ваши, врагу не видны): пеший отряд увязает и теряет ход."
        : "Зыбучие пески: пеший отряд увязает и теряет ход.";
    default:
      return `Мина (${whose}${field.hidden === true ? ", врагу не видна" : ""}): урон ${field.damage ?? 0} вражескому отряду.`;
  }
}

export function cellNote(state: BattleState, cell: Cell, playerSide: 0 | 1 = 0): string | null {
  const { siege } = state;
  const built = fieldAt(state, cell, playerSide);
  if (built !== undefined) {
    return fieldNote(built, playerSide);
  }
  if (siege === null) {
    return null;
  }
  const tower = towerMarks(state).find((mark) => sameCell(mark.cell, cell));
  if (tower !== undefined) {
    const low = tower.tower === "keep" ? siege.keepDamage : siege.towerDamage;
    return `${TOWER_NAMES[tower.tower]}: стреляет в начале раунда, урон ${damageText(low)}, прочность ${siege.health[tower.tower]}.`;
  }
  const segment = segmentAt(cell);
  if (segment !== undefined) {
    return siege.health[segment] > 0
      ? `Стена, прочность ${siege.health[segment]}. Ломают её катапульта и «Землетрясение».`
      : "Пролом: стена разрушена, проход свободен.";
  }
  if (isGate(cell)) {
    if (siege.health.gate === 0) {
      return "Ворота разбиты: проход свободен.";
    }
    const how = gateOpen(siege, state.stacks) ? "открыты" : "закрыты";
    return `Ворота ${how}, прочность ${siege.health.gate}. Открывает их только обороняющийся.`;
  }
  if (isMoat(siege, cell)) {
    return `Ров: вошедший теряет ${MOAT_DAMAGE} здоровья, его ход кончается, защита меньше на ${MOAT_DEFENSE}.`;
  }
  return wallCells(siege).some((wall) => sameCell(wall, cell)) ? "Стена. Её не сломать." : null;
}

/** Добавка к подсказке выстрела: урон уже посчитан с учётом стены. */
export function shotNote(state: BattleState, me: StackState, targetId: string): string {
  const target = findStack(state, targetId);
  return target !== undefined && hasWallPenalty(state.siege, me, target)
    ? " Через стену — урон вдвое меньше."
    : "";
}

/**
 * Что случилось до первого хода: башни и катапульта стреляют в начале раунда, и первого тоже.
 * Строка собрана по состоянию: она верна и для боя, поднятого из сохранения, где событий начала нет.
 */
export function openingLine(state: BattleState): string {
  const { siege } = state;
  if (siege === null || state.round !== 1) {
    return "";
  }
  const parts: string[] = [];
  for (const stack of state.stacks) {
    if (stack.side === 0 && stack.count < stack.initialCount) {
      parts.push(`башни: ${stack.creature.name}, погибло ${stack.initialCount - stack.count}`);
    }
  }
  const whole = Math.max(...SEGMENTS.map((part) => siege.health[part]));
  for (const [index, part] of SEGMENTS.entries()) {
    if (siege.health[part] < whole) {
      const left = siege.health[part];
      parts.push(
        left === 0
          ? `катапульта пробила участок стены ${index + 1}`
          : `катапульта повредила участок стены ${index + 1}`,
      );
    }
  }
  return parts.length === 0 ? "" : `До первого хода — ${parts.join("; ")}.`;
}

/** Надпись над частью стены после выстрела катапульты. */
export function catapultLabel(damage: number): string {
  return damage === 0 ? "не пробила" : `−${damage}`;
}

/** Событие, которое экран показывает до первого хода: выстрел башни, катапульты, гибель отряда. */
export function isSiegeShot(event: BattleEvent): boolean {
  return event.type === "towerShot" || event.type === "catapultShot" || event.type === "stackDied";
}

/**
 * Поле, каким оно было до выстрелов первого раунда: все отряды целы, стена не тронута.
 * Годится только для боя, в котором ещё не было ни одной команды.
 */
export function beforeOpening(state: BattleState, opening: readonly BattleEvent[]): BattleState {
  const { siege } = state;
  if (siege === null) {
    return state;
  }
  const health = { ...siege.health };
  for (const event of opening) {
    if (event.type === "catapultShot") {
      health[event.hit] = event.left + event.damage;
    }
  }
  return {
    ...state,
    siege: { ...siege, health },
    stacks: state.stacks.map((stack) => ({
      ...stack,
      count: stack.initialCount,
      firstHealth: stack.creature.health,
    })),
  };
}
