/**
 * Здания третьего замка «Башня» (75-third-castle.md): их строят только в городе Башни.
 * Числа — те же, что в `data/buildings.yaml`. Отдельный файл: набор зданий ядра
 * не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const TOWER_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "gnome-hill",
    name: "Гномий холм",
    cost: { gold: 500, wood: 5, ore: 5 },
    requires: ["fort"],
    dwelling: "gnome",
    faction: "tower",
  },
  {
    id: "gargoyle-roost",
    name: "Горгулий насест",
    cost: { gold: 1000, ore: 10 },
    requires: ["gnome-hill"],
    dwelling: "gargoyle",
    faction: "tower",
  },
  {
    id: "golem-workshop",
    name: "Големная мастерская",
    cost: { gold: 1500, ore: 15 },
    requires: ["gargoyle-roost"],
    dwelling: "golem",
    faction: "tower",
  },
  {
    id: "mage-tower",
    name: "Башня магов",
    cost: { gold: 2500, wood: 5, ore: 5, mercury: 5 },
    requires: ["golem-workshop"],
    dwelling: "mage",
    faction: "tower",
  },
  {
    id: "genie-lamp",
    name: "Лампа джиннов",
    cost: { gold: 3500, wood: 10, ore: 10, sulfur: 5 },
    requires: ["mage-tower"],
    dwelling: "genie",
    faction: "tower",
  },
  {
    id: "naga-temple",
    name: "Храм нагов",
    cost: { gold: 5000, wood: 10, ore: 15, gems: 5 },
    requires: ["genie-lamp"],
    dwelling: "naga",
    faction: "tower",
  },
  {
    id: "giant-hall",
    name: "Чертог великанов",
    cost: { gold: 7000, wood: 20, ore: 20, crystal: 8, gems: 8 },
    requires: ["naga-temple"],
    dwelling: "giant",
    faction: "tower",
  },
];
