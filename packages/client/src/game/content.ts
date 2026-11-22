/** Контент игры, нужный партии: существа, здания и начальные значения для старых сохранений. */
import type { CreatureDefinition } from "@homamru/core";
import {
  parseBuildingsFile,
  parseCreatureFile,
  parseDefaultsFile,
  parseHeroesFile,
  parseSpellsFile,
} from "@homamru/data";
import type { ContentError, SaveDefaults } from "@homamru/data";
import buildingsText from "../../../../data/buildings.yaml?raw";
import defaultsText from "../../../../data/defaults.yaml?raw";
import heroesText from "../../../../data/heroes.yaml?raw";
import spellsText from "../../../../data/spells.yaml?raw";
import { CREATURE_FILES } from "./contentCreatureFiles.ts";

const DEFAULTS_FILE = "data/defaults.yaml";
const SPELLS_FILE = "data/spells.yaml";

const BUILDINGS_FILE = "data/buildings.yaml";
const HEROES_FILE = "data/heroes.yaml";

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

/** Контент игры целиком и начальные значения (docs/mechanics/04-save.md). */
export function loadDefaults(): SaveDefaults {
  const creatures = loadCreatures();
  const buildings = parseBuildingsFile(BUILDINGS_FILE, buildingsText, creatures);
  const heroes = parseHeroesFile(HEROES_FILE, heroesText);
  const spells = parseSpellsFile(SPELLS_FILE, spellsText);
  if (!buildings.ok || !heroes.ok || !spells.ok) {
    return failContent([
      ...(buildings.ok ? [] : buildings.errors),
      ...(heroes.ok ? [] : heroes.errors),
      ...(spells.ok ? [] : spells.errors),
    ]);
  }
  const content = {
    creatures,
    buildings: buildings.value,
    heroes: heroes.value,
    spells: spells.value,
  };
  const parsed = parseDefaultsFile(DEFAULTS_FILE, defaultsText, content);
  return parsed.ok ? parsed.value : failContent(parsed.errors);
}
