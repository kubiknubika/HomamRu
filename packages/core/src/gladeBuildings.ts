/**
 * Здания второго замка «Чаща» (74-second-castle.md): их строят только в городе Чащи.
 * Числа — те же, что в `data/buildings.yaml`. Отдельный файл: набор зданий ядра
 * не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const GLADE_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "kentaur-glade",
    name: "Кентаврийская поляна",
    cost: { gold: 500, ore: 10 },
    requires: ["fort"],
    dwelling: "kentaur",
    faction: "glade",
  },
  {
    id: "huntress-lodge",
    name: "Охотничий домик",
    cost: { gold: 1000, wood: 5, ore: 5 },
    requires: ["kentaur-glade"],
    dwelling: "huntress",
    faction: "glade",
  },
  {
    id: "eagle-aerie",
    name: "Орлиное гнездо",
    cost: { gold: 1000, ore: 5 },
    requires: ["huntress-lodge"],
    dwelling: "eagle",
    faction: "glade",
  },
  {
    id: "ent-grove",
    name: "Роща древней",
    cost: { gold: 2000, ore: 5 },
    requires: ["eagle-aerie"],
    dwelling: "ent",
    faction: "glade",
  },
  {
    id: "warden-hall",
    name: "Зал хранителей",
    cost: { gold: 3000, wood: 10, ore: 10 },
    requires: ["ent-grove"],
    dwelling: "warden",
    faction: "glade",
  },
  {
    id: "wyvern-cliff",
    name: "Вьюнов утёс",
    cost: { gold: 4000, wood: 10, ore: 15, gems: 5 },
    requires: ["warden-hall"],
    dwelling: "wyvern",
    faction: "glade",
  },
];
