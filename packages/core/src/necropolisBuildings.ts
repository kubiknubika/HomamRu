/**
 * Здания шестого замка «Некрополь» (78-sixth-castle.md): их строят только в городе
 * Некрополя. Числа — те же, что в `data/buildings.yaml`. Отдельный файл: набор зданий
 * ядра не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const NECROPOLIS_BUILDINGS: readonly BuildingDefinition[] = [
  {
    id: "skeleton-pit",
    name: "Скелетная яма",
    cost: { gold: 500, wood: 5 },
    requires: ["fort"],
    dwelling: "skeleton",
    faction: "necropolis",
  },
  {
    id: "zombie-yard",
    name: "Мертвяцкий двор",
    cost: { gold: 1000, wood: 5, ore: 5 },
    requires: ["skeleton-pit"],
    dwelling: "zombie",
    faction: "necropolis",
  },
  {
    id: "wight-crypt",
    name: "Склеп призраков",
    cost: { gold: 1500, ore: 15 },
    requires: ["zombie-yard"],
    dwelling: "wight",
    faction: "necropolis",
  },
  {
    id: "vampire-crypt",
    name: "Вампирья усыпальница",
    cost: { gold: 2500, wood: 5, ore: 10 },
    requires: ["wight-crypt"],
    dwelling: "vampire",
    faction: "necropolis",
  },
  {
    id: "lich-tower",
    name: "Личья башня",
    cost: { gold: 3500, wood: 10, ore: 10, mercury: 5 },
    requires: ["vampire-crypt"],
    dwelling: "lich",
    faction: "necropolis",
  },
  {
    id: "deathknight-hall",
    name: "Чертог могильных рыцарей",
    cost: { gold: 5000, wood: 10, ore: 15, sulfur: 8 },
    requires: ["lich-tower"],
    dwelling: "deathknight",
    faction: "necropolis",
  },
  {
    id: "bonedragon-lair",
    name: "Костяное логово",
    cost: { gold: 7000, wood: 20, ore: 20, crystal: 8, gems: 8 },
    requires: ["deathknight-hall"],
    dwelling: "bonedragon",
    faction: "necropolis",
  },
];
