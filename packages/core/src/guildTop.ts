/**
 * Пятый круг гильдии магов (docs/content/towns.md). Числа те же, что в `data/buildings.yaml`.
 * Отдельный файл: без него три заклинания пятого круга недоступны ни в одном городе,
 * а набор зданий ядра не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition } from "./types.ts";

export const GUILD_TOP: readonly BuildingDefinition[] = [
  {
    id: "mage-guild-5",
    name: "Гильдия магов, уровень 5",
    cost: { gold: 2000, wood: 5, ore: 5, mercury: 10, sulfur: 10, crystal: 10, gems: 10 },
    requires: ["mage-guild-4"],
    mageGuild: 5,
  },
];
