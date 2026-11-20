/**
 * Жилища людей 5–7 уровней (74-second-castle.md, 31-recruitment.md). Числа — те же,
 * что в `data/buildings.yaml`. Отдельный файл: набор зданий ядра не должен
 * перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const CASTLE_TOP_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "stables",
    name: "Конюшня",
    cost: { gold: 3000, wood: 5, ore: 10 },
    requires: ["barracks"],
    dwelling: "cavalier",
    faction: "castle",
  },
  {
    id: "champion-hall",
    name: "Палата витязей",
    cost: { gold: 4000, wood: 10, ore: 10, gems: 5 },
    requires: ["stables"],
    dwelling: "champion",
    faction: "castle",
  },
  {
    id: "griffin-tower",
    name: "Гнездо гривы",
    cost: { gold: 6000, wood: 15, ore: 15, crystal: 8, gems: 8 },
    requires: ["champion-hall"],
    dwelling: "griffin",
    faction: "castle",
  },
];
