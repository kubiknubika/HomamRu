/** Контент игры, нужный партии: существа, здания и начальные значения для старых сохранений. */
import type { BuildingDefinition, CreatureDefinition } from "@homamru/core";
import { parseBuildingsFile, parseCreatureFile, parseDefaultsFile } from "@homamru/data";
import type { ContentError, SaveDefaults } from "@homamru/data";
import buildingsText from "../../../../data/buildings.yaml?raw";
import armsmanText from "../../../../data/creatures/armsman.json?raw";
import falconText from "../../../../data/creatures/falcon.json?raw";
import militiaText from "../../../../data/creatures/militia.json?raw";
import slingerText from "../../../../data/creatures/slinger.json?raw";
import defaultsText from "../../../../data/defaults.yaml?raw";

const DEFAULTS_FILE = "data/defaults.yaml";

const BUILDINGS_FILE = "data/buildings.yaml";

const CREATURE_FILES = [
  { file: "data/creatures/armsman.json", text: armsmanText },
  { file: "data/creatures/falcon.json", text: falconText },
  { file: "data/creatures/militia.json", text: militiaText },
  { file: "data/creatures/slinger.json", text: slingerText },
] as const;

/** Ошибка в файлах игры — исключение: с ней нельзя ни начать партию, ни продолжить. */
export function failContent(errors: readonly ContentError[]): never {
  throw new Error(errors.map((e) => `${e.file}: ${e.field}: ${e.message}`).join("\n"));
}

/** Все существа игры, по алфавиту файлов. */
export function loadCreatures(): CreatureDefinition[] {
  return CREATURE_FILES.map((entry) => {
    const parsed = parseCreatureFile(entry.file, entry.text);
    return parsed.ok ? parsed.value : failContent(parsed.errors);
  });
}

/** Все здания игры (docs/mechanics/30-town.md). */
export function loadBuildings(): BuildingDefinition[] {
  const parsed = parseBuildingsFile(BUILDINGS_FILE, buildingsText, loadCreatures());
  return parsed.ok ? parsed.value : failContent(parsed.errors);
}

/** Начальные значения из контента (docs/mechanics/04-save.md, «Сохранения других версий»). */
export function loadDefaults(): SaveDefaults {
  const parsed = parseDefaultsFile(DEFAULTS_FILE, defaultsText, loadCreatures(), loadBuildings());
  return parsed.ok ? parsed.value : failContent(parsed.errors);
}
