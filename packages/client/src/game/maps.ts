/**
 * Карты, которые можно открыть на экране. Пока все — проверочные.
 * Первая — с охранниками: на ней виден весь этап 3. Настоящая карта будет на шаге 3.4.
 */
import { createGame } from "@homamru/core";
import type { GameState } from "@homamru/core";
import { parseMapFile } from "@homamru/data";
import { loadCreatures } from "./content.ts";
import guardsMapText from "../../../../data/maps/test-guards.yaml?raw";
import largeMapText from "../../../../data/maps/test-large.yaml?raw";
import objectsMapText from "../../../../data/maps/test-objects.yaml?raw";
import smallMapText from "../../../../data/maps/test-small.yaml?raw";

const SEED = 1;

const MAP_FILES = [
  { file: "data/maps/test-guards.yaml", text: guardsMapText, label: "с охраной" },
  { file: "data/maps/test-objects.yaml", text: objectsMapText, label: "с объектами" },
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
  const creatures = loadCreatures();
  const map = parseMapFile(entry.file, entry.text, creatures);
  const errors = map.ok ? [] : map.errors;
  const created = map.ok ? createGame(map.value, SEED, creatures) : undefined;
  if (created?.ok) {
    return created.state;
  }
  const all = created === undefined ? errors : created.errors;
  throw new Error(all.map((e) => `${entry.file}: ${e.field}: ${e.message}`).join("\n"));
}
