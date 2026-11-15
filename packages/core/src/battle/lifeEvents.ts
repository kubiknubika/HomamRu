/**
 * События заклинаний жизни: «Воскрешение», «Клон», «Жертва».
 * Спецификация: docs/mechanics/71-spells-life.md.
 */
import type { Cell } from "./hex.ts";

export type LifeEvent =
  | {
      /** Отряд поднят: `raised` существ встало, `lasting` — насовсем или до конца боя. */
      readonly type: "stackRaised";
      readonly stackId: string;
      readonly raised: number;
      readonly healed: number;
      readonly lasting: boolean;
      readonly left: number;
    }
  | {
      /** Рядом с отрядом `stackId` встал его клон `cloneId`. */
      readonly type: "cloneCreated";
      readonly stackId: string;
      readonly cloneId: string;
      readonly cell: Cell;
      readonly rounds: number;
    }
  /** Клон исчез: вышел срок или его сняли заклинанием. От урона клон гибнет как отряд. */
  | {
      readonly type: "cloneGone";
      readonly stackId: string;
      readonly reason: "expired" | "dispelled";
    }
  /** Отряд отдан в жертву. */
  | { readonly type: "stackSacrificed"; readonly stackId: string };
