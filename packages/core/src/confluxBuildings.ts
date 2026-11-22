/**
 * Здания девятого замка «Согласие» (81-ninth-castle.md): их строят только в городе
 * Согласия. Числа — те же, что в `data/buildings.yaml`. Отдельный файл: набор зданий
 * ядра не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const CONFLUX_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "pixie-ring",
    name: "Фейский круг",
    cost: { gold: 500, wood: 5 },
    requires: ["fort"],
    dwelling: "pixie",
    faction: "conflux",
  },
  {
    id: "air-temple",
    name: "Храм воздуха",
    cost: { gold: 1000, wood: 5, ore: 5, mercury: 3 },
    requires: ["pixie-ring"],
    dwelling: "airelem",
    faction: "conflux",
  },
  {
    id: "water-temple",
    name: "Храм воды",
    cost: { gold: 1500, ore: 15, mercury: 3 },
    requires: ["air-temple"],
    dwelling: "waterelem",
    faction: "conflux",
  },
  {
    id: "earth-temple",
    name: "Храм земли",
    cost: { gold: 2500, wood: 5, ore: 10, sulfur: 5 },
    requires: ["water-temple"],
    dwelling: "earthlem",
    faction: "conflux",
  },
  {
    id: "fire-temple",
    name: "Храм огня",
    cost: { gold: 3500, wood: 10, ore: 10, sulfur: 5 },
    requires: ["earth-temple"],
    dwelling: "fireelem",
    faction: "conflux",
  },
  {
    id: "spirit-temple",
    name: "Храм духа",
    cost: { gold: 5000, wood: 10, ore: 15, mercury: 5, gems: 5 },
    requires: ["fire-temple"],
    dwelling: "psychelem",
    faction: "conflux",
  },
  {
    id: "phoenix-nest",
    name: "Фениксово гнездо",
    cost: { gold: 9000, wood: 20, ore: 20, crystal: 8, gems: 8 },
    requires: ["spirit-temple"],
    dwelling: "phoenix",
    faction: "conflux",
  },
];
