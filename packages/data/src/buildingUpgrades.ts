/**
 * Проверка улучшений жилищ (82-creature-upgrades.md). Вынесена из `battle.ts`:
 * файл зданий и существ не должен перерастать предел в 300 строк.
 */
import type { BuildingDefinition, CreatureDefinition } from "@homamru/core";

/**
 * Улучшение жилища (82-creature-upgrades.md): улучшенное здание стоит после базового,
 * называет его в `requires`, его жилец — другое существо того же уровня и замка.
 */
export function upgradeErrors(
  file: string,
  index: number,
  building: BuildingDefinition,
  buildings: readonly BuildingDefinition[],
  ids: readonly string[],
  creatures: readonly CreatureDefinition[],
): { file: string; field: string; message: string }[] {
  const { upgrade } = building;
  if (upgrade === undefined) {
    return [];
  }
  const errors: { file: string; field: string; message: string }[] = [];
  const base = buildings.find((candidate) => candidate.id === upgrade.base);
  if (base === undefined || !ids.slice(0, index).includes(upgrade.base)) {
    errors.push({
      file,
      field: `${index}.upgrade.base`,
      message: `Базового жилища «${upgrade.base}» выше в файле нет.`,
    });
  } else if (!building.requires.includes(upgrade.base)) {
    errors.push({
      file,
      field: `${index}.requires`,
      message: `Улучшению «${building.id}» нужно базовое жилище «${upgrade.base}».`,
    });
  } else if (base.dwelling !== upgrade.becomes) {
    // Улучшенное жилище — это второе жилище того же уровня того же замка.
    const old = creatures.find((creature) => creature.id === base.dwelling);
    const next = creatures.find((creature) => creature.id === upgrade.becomes);
    if (next === undefined) {
      errors.push({
        file,
        field: `${index}.upgrade.becomes`,
        message: `Существа «${upgrade.becomes}» нет.`,
      });
    } else if (old !== undefined && old.level !== next.level) {
      errors.push({
        file,
        field: `${index}.upgrade.becomes`,
        message: `Улучшение «${upgrade.becomes}» другого уровня: ${String(next.level)} вместо ${String(old.level)}.`,
      });
    }
  }
  if (building.dwelling !== upgrade.becomes) {
    errors.push({
      file,
      field: `${index}.dwelling`,
      message: `Улучшенное жилище нанимает «${upgrade.becomes}», а не «${String(building.dwelling)}».`,
    });
  }
  return errors;
}
