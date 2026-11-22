/**
 * Здания четвёртого замка «Инферно» (76-fourth-castle.md): их строят только в городе Инферно.
 * Числа — те же, что в `data/buildings.yaml`. Отдельный файл: набор зданий ядра
 * не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const INFERNO_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "imp-hovel",
    name: "Бесовская нора",
    cost: { gold: 500, wood: 5, ore: 5 },
    requires: ["fort"],
    dwelling: "imp",
    faction: "inferno",
  },
  {
    id: "demonling-pit",
    name: "Бесёнкин сруб",
    cost: { gold: 1000, wood: 5, ore: 5 },
    requires: ["imp-hovel"],
    dwelling: "demonling",
    faction: "inferno",
  },
  {
    id: "hound-kennel",
    name: "Гончая псарня",
    cost: { gold: 1500, ore: 15 },
    requires: ["demonling-pit"],
    dwelling: "hound",
    faction: "inferno",
  },
  {
    id: "horned-tower",
    name: "Рогатая башня",
    cost: { gold: 2500, wood: 5, ore: 10 },
    requires: ["hound-kennel"],
    dwelling: "horned",
    faction: "inferno",
  },
  {
    id: "fiend-gate",
    name: "Врата исчадий",
    cost: { gold: 3500, wood: 10, ore: 10, mercury: 5 },
    requires: ["horned-tower"],
    dwelling: "fiend",
    faction: "inferno",
  },
  {
    id: "efreet-forge",
    name: "Ифритова кузня",
    cost: { gold: 5000, wood: 10, ore: 15, sulfur: 8 },
    requires: ["fiend-gate"],
    dwelling: "efreet",
    faction: "inferno",
  },
  {
    id: "archfiend-throne",
    name: "Престол архибеса",
    cost: { gold: 7000, wood: 20, ore: 20, crystal: 8, gems: 8 },
    requires: ["efreet-forge"],
    dwelling: "archfiend",
    faction: "inferno",
  },
];
