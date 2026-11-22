/**
 * Улучшения жилищ людей (82-creature-upgrades.md): числа те же, что в `data/buildings.yaml`.
 * Отдельный файл: набор зданий ядра не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const CASTLE_UPGRADE_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "militia-yard-up",
    name: "Двор ветеранов",
    cost: { gold: 800, wood: 8, ore: 5 },
    requires: ["militia-yard"],
    dwelling: "militia-vet",
    faction: "castle",
    upgrade: { base: "militia-yard", becomes: "militia-vet" },
  },
  {
    id: "slinger-range-up",
    name: "Стрельбище мастеров",
    cost: { gold: 1600, wood: 8, ore: 8 },
    requires: ["slinger-range"],
    dwelling: "slinger-ace",
    faction: "castle",
    upgrade: { base: "slinger-range", becomes: "slinger-ace" },
  },
  {
    id: "falcon-tower-up",
    name: "Соколиная вышка",
    cost: { gold: 1600, ore: 8 },
    requires: ["falcon-tower"],
    dwelling: "falcon-gold",
    faction: "castle",
    upgrade: { base: "falcon-tower", becomes: "falcon-gold" },
  },
  {
    id: "barracks-up",
    name: "Казарма стражников",
    cost: { gold: 3200, ore: 8, wood: 8 },
    requires: ["barracks"],
    dwelling: "armsman-guard",
    faction: "castle",
    upgrade: { base: "barracks", becomes: "armsman-guard" },
  },
  {
    id: "stables-up",
    name: "Конюшня копейщиков",
    cost: { gold: 5000, wood: 10, ore: 10, gems: 5 },
    requires: ["stables"],
    dwelling: "cavalier-lance",
    faction: "castle",
    upgrade: { base: "stables", becomes: "cavalier-lance" },
  },
  {
    id: "champion-hall-up",
    name: "Палата паладинов",
    cost: { gold: 6400, wood: 15, ore: 15, gems: 8 },
    requires: ["champion-hall"],
    dwelling: "champion-paladin",
    faction: "castle",
    upgrade: { base: "champion-hall", becomes: "champion-paladin" },
  },
  {
    id: "griffin-tower-up",
    name: "Гнездо серебряной гривы",
    cost: { gold: 9500, wood: 20, ore: 20, crystal: 10, gems: 10 },
    requires: ["griffin-tower"],
    dwelling: "griffin-silver",
    faction: "castle",
    upgrade: { base: "griffin-tower", becomes: "griffin-silver" },
  },
];
