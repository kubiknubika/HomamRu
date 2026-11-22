/**
 * Здания пятого замка «Подземелье» (77-fifth-castle.md): их строят только в городе
 * Подземелья. Числа — те же, что в `data/buildings.yaml`. Отдельный файл: набор зданий
 * ядра не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const DUNGEON_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "troglodyte-cave",
    name: "Пещерникова нора",
    cost: { gold: 500, ore: 10 },
    requires: ["fort"],
    dwelling: "troglodyte",
    faction: "dungeon",
  },
  {
    id: "harpy-nest",
    name: "Гарпий насест",
    cost: { gold: 1000, wood: 5, ore: 5 },
    requires: ["troglodyte-cave"],
    dwelling: "harpy",
    faction: "dungeon",
  },
  {
    id: "eye-tower",
    name: "Башня глаз",
    cost: { gold: 1500, wood: 5, ore: 10 },
    requires: ["harpy-nest"],
    dwelling: "eye",
    faction: "dungeon",
  },
  {
    id: "medusa-temple",
    name: "Храм медуз",
    cost: { gold: 2500, wood: 5, ore: 5, sulfur: 5 },
    requires: ["eye-tower"],
    dwelling: "medusa",
    faction: "dungeon",
  },
  {
    id: "minotaur-labyrinth",
    name: "Лабиринт минотавра",
    cost: { gold: 3500, wood: 10, ore: 10 },
    requires: ["medusa-temple"],
    dwelling: "minotaur",
    faction: "dungeon",
  },
  {
    id: "manticore-den",
    name: "Мантикор логово",
    cost: { gold: 5000, wood: 10, ore: 15, mercury: 5 },
    requires: ["minotaur-labyrinth"],
    dwelling: "manticore",
    faction: "dungeon",
  },
  {
    id: "dragon-lair",
    name: "Змеиное логово",
    cost: { gold: 7500, wood: 20, ore: 20, crystal: 8, gems: 8 },
    requires: ["manticore-den"],
    dwelling: "blackdragon",
    faction: "dungeon",
  },
];
