/** Рисование поля боя: клетки, стена, ров, ворота, башни. Вынесено из сцены. */
import { BATTLE_HEIGHT, BATTLE_WIDTH } from "@homamru/core";
import type { BattleState } from "@homamru/core";
import type * as Phaser from "phaser";
import { tracePath } from "./battleEffects.ts";
import { cellCenter, cellCorners } from "./battleGeometry.ts";
import type { BattleLayout } from "./battleGeometry.ts";
import { cellLook, towerMarks } from "./battleSiege.ts";
import {
  CELL_LOOK_COLORS,
  FIELD_LINE_COLOR,
  TOWER_COLOR,
  TOWER_FLAG_COLOR,
} from "./battleStubs.ts";

export function drawBattleField(
  graphics: Phaser.GameObjects.Graphics,
  layout: BattleLayout,
  state: BattleState,
): void {
  graphics.clear();
  graphics.lineStyle(1.5, FIELD_LINE_COLOR, 0.9);
  for (let row = 0; row < BATTLE_HEIGHT; row += 1) {
    for (let col = 0; col < BATTLE_WIDTH; col += 1) {
      graphics.fillStyle(CELL_LOOK_COLORS[cellLook(state, { col, row })], 1);
      tracePath(graphics, cellCorners(layout, { col, row }));
      graphics.fillPath();
      graphics.strokePath();
    }
  }
  const size = Math.min(layout.cellWidth, layout.radius * 1.9) * 0.55;
  for (const { cell } of towerMarks(state)) {
    const { x, y } = cellCenter(layout, cell);
    graphics.fillStyle(TOWER_COLOR, 1);
    graphics.fillRect(x - size / 2, y - size / 2, size, size);
    graphics.fillStyle(TOWER_FLAG_COLOR, 1);
    graphics.fillTriangle(x, y - size, x, y - size / 2, x + size / 2, y - size * 0.75);
  }
}
