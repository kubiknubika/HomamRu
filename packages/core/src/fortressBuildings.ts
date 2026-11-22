/**
 * Здания восьмого замка «Крепость» (80-eighth-castle.md): их строят только в городе
 * Крепости. Числа — те же, что в `data/buildings.yaml`. Отдельный файл: набор зданий
 * ядра не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const FORTRESS_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "gnoll-hut",
    name: "Гнолльская хижина",
    cost: { gold: 500, wood: 5 },
    requires: ["fort"],
    dwelling: "gnoll",
    faction: "fortress",
  },
  {
    id: "lizard-pool",
    name: "Ящерье озерцо",
    cost: { gold: 1000, wood: 5, ore: 5 },
    requires: ["gnoll-hut"],
    dwelling: "lizardman",
    faction: "fortress",
  },
  {
    id: "serpentfly-swamp",
    name: "Топь змеиных мух",
    cost: { gold: 1500, ore: 15 },
    requires: ["lizard-pool"],
    dwelling: "serpentfly",
    faction: "fortress",
  },
  {
    id: "basilisk-pit",
    name: "Василискова яма",
    cost: { gold: 2500, wood: 5, ore: 10, sulfur: 5 },
    requires: ["serpentfly-swamp"],
    dwelling: "basilisk",
    faction: "fortress",
  },
  {
    id: "gorgon-temple",
    name: "Храм горгон",
    cost: { gold: 3500, wood: 10, ore: 10, gems: 5 },
    requires: ["basilisk-pit"],
    dwelling: "gorgon",
    faction: "fortress",
  },
  {
    id: "bogwyvern-cliff",
    name: "Трясинный утёс",
    cost: { gold: 5000, wood: 10, ore: 15, mercury: 5 },
    requires: ["gorgon-temple"],
    dwelling: "bogwyvern",
    faction: "fortress",
  },
  {
    id: "hydra-marsh",
    name: "Гидрова топь",
    cost: { gold: 7500, wood: 20, ore: 20, crystal: 8, gems: 8 },
    requires: ["bogwyvern-cliff"],
    dwelling: "hydra",
    faction: "fortress",
  },
];
