/**
 * Существа людей 5–7 уровней (74-second-castle.md). Числа те же, что в `data/creatures/`.
 */
import type { CreatureDefinition } from "./types.ts";

export const CASTLE_TOP_CREATURES: readonly CreatureDefinition[] = [
  {
    id: "cavalier",
    name: "Всадник",
    attack: 12,
    defense: 9,
    damageMin: 7,
    damageMax: 12,
    health: 45,
    speed: 9,
    flying: false,
    shots: 0,
    price: 450,
    growth: 3,
  },
  {
    id: "champion",
    name: "Витязь",
    attack: 14,
    defense: 13,
    damageMin: 10,
    damageMax: 16,
    health: 65,
    speed: 7,
    flying: false,
    shots: 0,
    price: 700,
    growth: 2,
  },
  {
    id: "griffin",
    name: "Грива",
    attack: 16,
    defense: 14,
    damageMin: 15,
    damageMax: 25,
    health: 95,
    speed: 11,
    flying: true,
    shots: 0,
    price: 1200,
    growth: 1,
  },
];
