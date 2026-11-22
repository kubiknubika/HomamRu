/**
 * Все здания-улучшения жилищ (82-creature-upgrades.md), по порядку порций 73–76: люди, Чаща
 * и Башня, Инферно с Подземельем и Некрополем, Цитадель с Крепостью и Согласием. Собраны
 * в один набор, чтобы `testkit.ts` не перерастал предел в 300 строк.
 */
import { CASTLE_UPGRADE_BUILDINGS } from "./castleUpgradeBuildings.ts";
import { GLADE_TOWER_UPGRADE_BUILDINGS } from "./gladeTowerUpgradeBuildings.ts";
import { LAST_UPGRADE_BUILDINGS } from "./lastUpgradeBuildings.ts";
import { LATE_UPGRADE_BUILDINGS } from "./lateUpgradeBuildings.ts";
import type { BuildingDefinition } from "./types.ts";

export const UPGRADE_BUILDINGS: readonly BuildingDefinition[] = [
  ...CASTLE_UPGRADE_BUILDINGS,
  ...GLADE_TOWER_UPGRADE_BUILDINGS,
  ...LATE_UPGRADE_BUILDINGS,
  ...LAST_UPGRADE_BUILDINGS,
];
