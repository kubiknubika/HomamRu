/**
 * Здания седьмого замка «Цитадель варваров» (79-seventh-castle.md): их строят только в
 * городе Цитадели. Числа — те же, что в `data/buildings.yaml`. Отдельный файл: набор
 * зданий ядра не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const STRONGHOLD_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "goblin-camp",
    name: "Гоблинский табор",
    cost: { gold: 500, wood: 5 },
    requires: ["fort"],
    dwelling: "goblin",
    faction: "stronghold",
  },
  {
    id: "wolfrider-pen",
    name: "Волчий загон",
    cost: { gold: 1000, wood: 5, ore: 5 },
    requires: ["goblin-camp"],
    dwelling: "wolfrider",
    faction: "stronghold",
  },
  {
    id: "orc-hut",
    name: "Оркова хижина",
    cost: { gold: 1500, ore: 15 },
    requires: ["wolfrider-pen"],
    dwelling: "orc",
    faction: "stronghold",
  },
  {
    id: "ogre-mound",
    name: "Огрова насыпь",
    cost: { gold: 2500, wood: 5, ore: 10 },
    requires: ["orc-hut"],
    dwelling: "ogre",
    faction: "stronghold",
  },
  {
    id: "roc-nest",
    name: "Гнездовье рух",
    cost: { gold: 3500, wood: 10, ore: 10, mercury: 5 },
    requires: ["ogre-mound"],
    dwelling: "roc",
    faction: "stronghold",
  },
  {
    id: "cyclop-cave",
    name: "Циклопова пещера",
    cost: { gold: 5000, wood: 10, ore: 15, sulfur: 8 },
    requires: ["roc-nest"],
    dwelling: "cyclop",
    faction: "stronghold",
  },
  {
    id: "behemoth-den",
    name: "Бегемотово логово",
    cost: { gold: 8000, wood: 20, ore: 20, crystal: 8, gems: 8 },
    requires: ["cyclop-cave"],
    dwelling: "behemoth",
    faction: "stronghold",
  },
];
