/**
 * Согласование заглушек объектов карты с состоянием: что убрать, что перерисовать,
 * что оставить как есть. Вынесено из сцены (`mapScene.ts`), потому что это правило,
 * а не рисование, и его можно проверить без Phaser.
 * Спецификация: docs/mechanics/24-map-screen.md, «Что добавляется на карте».
 */
import type { ObjectState } from "@homamru/core";
import { objectStubKey } from "./objectStubs.ts";

/** Что сделать с заглушкой. */
export type StubAction =
  /** Объекта больше нет: подобран, побеждён, город захвачен и исчез. */
  | { readonly kind: "remove"; readonly id: string }
  /** Объект есть, но выглядит иначе: сменился владелец шахты или города. */
  | { readonly kind: "redraw"; readonly object: ObjectState }
  /** Заглушка уже такая, какая нужна. */
  | { readonly kind: "keep"; readonly id: string };

/**
 * Сравнивает заглушки с объектами карты.
 * `keys` — по чему видно, что заглушка устарела (`objectStubKey`).
 * Порядок: сперва убрать исчезнувшее, потом перерисовать изменившееся; остальное не трогается.
 */
export function stubActions(
  objects: readonly ObjectState[],
  keys: ReadonlyMap<string, string>,
): readonly StubAction[] {
  const present = new Set(objects.map((object) => object.id));
  const actions: StubAction[] = [];
  for (const id of keys.keys()) {
    if (!present.has(id)) {
      actions.push({ kind: "remove", id });
    }
  }
  for (const object of objects) {
    const existing = keys.get(object.id);
    if (existing === undefined) {
      actions.push({ kind: "redraw", object });
    } else if (existing === objectStubKey(object)) {
      actions.push({ kind: "keep", id: object.id });
    } else {
      actions.push({ kind: "redraw", object });
    }
  }
  return actions;
}
