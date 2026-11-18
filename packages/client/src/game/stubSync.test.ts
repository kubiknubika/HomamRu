/**
 * Согласование заглушек объектов карты с состоянием (docs/mechanics/24-map-screen.md).
 * Проверяем не рисование, а решение: что убрать, что перерисовать, что не трогать.
 */
import type { ObjectState } from "@homamru/core";
import { describe, expect, it } from "vitest";
import { objectStubKey } from "./objectStubs.ts";
import { stubActions } from "./stubSync.ts";

function mine(id: string, owner: number | null = null): ObjectState {
  return { id, type: "mine", x: 1, y: 1, kind: "gold-mine", owner };
}

function pile(id: string): ObjectState {
  return { id, type: "pile", x: 2, y: 2, resource: "wood", amount: 3 };
}

function keysOf(objects: readonly ObjectState[]): Map<string, string> {
  return new Map(objects.map((object) => [object.id, objectStubKey(object)]));
}

describe("согласование заглушек карты", () => {
  it("ничего не изменилось — ничего не трогаем", () => {
    const objects = [mine("m1", 0), pile("p1")];
    const actions = stubActions(objects, keysOf(objects));
    expect(actions.filter((action) => action.kind !== "keep")).toEqual([]);
    expect(actions).toHaveLength(2);
  });

  it("объект исчез — заглушку убрать", () => {
    const actions = stubActions([pile("p1")], keysOf([mine("m1", 0), pile("p1")]));
    expect(actions.filter((action) => action.kind === "remove")).toEqual([
      { kind: "remove", id: "m1" },
    ]);
  });

  /** Главное: смена владельца перерисовывает шахту, но не кучку. */
  it("сменился владелец шахты — перерисовать, хозяин не менялся — не трогать", () => {
    const before = keysOf([mine("m1", 0)]);
    const actions = stubActions([mine("m1", 1)], before);
    expect(actions).toEqual([{ kind: "redraw", object: mine("m1", 1) }]);
    expect(stubActions([mine("m1", 0)], before)).toEqual([{ kind: "keep", id: "m1" }]);
  });

  it("у кучки ключ не зависит от того, кто её подобрал", () => {
    expect(objectStubKey(pile("p1"))).toBe("pile");
    expect(objectStubKey(mine("m1"))).toBe("mine:-");
    expect(objectStubKey(mine("m1", 2))).toBe("mine:2");
  });

  it("новый объект — перерисовать, старых заглушек не остаётся", () => {
    const actions = stubActions([mine("m9", 0)], new Map());
    expect(actions).toEqual([{ kind: "redraw", object: mine("m9", 0) }]);
  });

  /** Свойство: заглушек после согласования ровно столько, сколько объектов. */
  it("на сорока наборах: keep + redraw = объектов, remove = исчезнувших", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const oldObjects = [mine("a", seed % 3), mine("b", 1), pile("c")];
      const newObjects = [mine("a", (seed + 1) % 3), pile("d")];
      const actions = stubActions(newObjects, keysOf(oldObjects));
      const kept = actions.filter((action) => action.kind !== "remove");
      const removed = actions.filter((action) => action.kind === "remove");
      expect(kept).toHaveLength(newObjects.length);
      // В старом наборе три объекта, в новом два: «b» и «c» исчезли.
      expect(removed).toHaveLength(2);
      expect(removed.map((action) => (action.kind === "remove" ? action.id : ""))).toEqual([
        "b",
        "c",
      ]);
      // Каждый объект получает ровно одно решение.
      const ids = kept.map((action) => (action.kind === "keep" ? action.id : action.object.id));
      expect(new Set(ids).size).toBe(newObjects.length);
    }
  });
});
