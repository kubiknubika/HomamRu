/** Показ событий осады: выстрел башни, выстрел катапульты, урон рва. */
import { isMachine } from "@homamru/core";
import type { BattleEvent, BattleState } from "@homamru/core";
import type * as Phaser from "phaser";
import { showPointLabel, showShot, showStrike } from "./battleEffects.ts";
import { cellCenter } from "./battleGeometry.ts";
import type { BattleLayout } from "./battleGeometry.ts";
import { catapultLabel, partCell, TOWER_CELLS } from "./battleSiege.ts";
import type { StackStub } from "./battleStubs.ts";

interface SiegeView {
  readonly layout: BattleLayout;
  readonly stubs: ReadonlyMap<string, StackStub>;
  /** Размер отряда на экране. */
  readonly size: number;
  readonly state: BattleState;
}

/**
 * Показывает событие осады и зовёт `next`, когда показ кончился.
 * `false` — событие не про осаду или показать его не на чем: `next` не вызван.
 */
export function showSiegeEvent(
  scene: Phaser.Scene,
  view: SiegeView,
  event: BattleEvent,
  redrawField: () => void,
  next: () => void,
): boolean {
  const { layout, stubs, size, state } = view;
  if (event.type === "catapultShot") {
    const catapult = state.stacks.find((stack) => isMachine(stack));
    const to = cellCenter(layout, partCell(event.hit));
    showShot(scene, catapult === undefined ? to : cellCenter(layout, catapult), to, size, () => {
      // Пролом виден сразу после попадания.
      redrawField();
      showPointLabel(scene, to, size, catapultLabel(event.damage), next);
    });
    return true;
  }
  if (event.type !== "towerShot" && event.type !== "moatDamage") {
    return false;
  }
  const stub = stubs.get(event.type === "towerShot" ? event.targetId : event.stackId);
  if (stub === undefined) {
    return false;
  }
  const strike = { damage: event.damage, left: event.left, lucky: false };
  if (event.type === "moatDamage") {
    showStrike(scene, stub, size, strike, next);
  } else {
    const from = cellCenter(layout, TOWER_CELLS[event.tower]);
    showShot(scene, from, stub.container, size, () => {
      showStrike(scene, stub, size, strike, next);
    });
  }
  return true;
}
