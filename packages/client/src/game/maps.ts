/** Карты, которые можно открыть на экране. Пока обе — проверочные. */
import { createGame } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { parseMapFile } from "@homamru/data";
import largeMapText from "../../../../data/maps/test-large.yaml?raw";
import smallMapText from "../../../../data/maps/test-small.yaml?raw";

const SEED = 1;

const MAP_FILES = [
  { file: "data/maps/test-small.yaml", text: smallMapText, label: "маленькая" },
  { file: "data/maps/test-large.yaml", text: largeMapText, label: "большая" },
] as const;

export const MAP_COUNT = MAP_FILES.length;

/** Номер карты по её идентификатору; неизвестная карта — первая. */
export function mapIndexOf(id: string): number {
  const index = MAP_FILES.findIndex((entry) => entry.file.endsWith(`/${id}.yaml`));
  return Math.max(index, 0);
}

/** Короткое название карты для отладочной кнопки. */
export function mapLabel(index: number): string {
  return MAP_FILES[index]?.label ?? "";
}

/** Начинает новую партию на карте с данным номером. Ошибка в файле карты — исключение. */
export function startGame(index: number): GameState {
  const entry = MAP_FILES[index];
  if (entry === undefined) {
    throw new Error(`Карты с номером ${index} нет.`);
  }
  const map = parseMapFile(entry.file, entry.text);
  const errors = map.ok ? [] : map.errors;
  const created = map.ok ? createGame(map.value, SEED) : undefined;
  if (created?.ok) {
    return created.state;
  }
  const all = created === undefined ? errors : created.errors;
  throw new Error(all.map((e) => `${entry.file}: ${e.field}: ${e.message}`).join("\n"));
}
