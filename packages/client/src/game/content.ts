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
import armsmanText from "../../../../data/creatures/armsman.json?raw";
import aurochsText from "../../../../data/creatures/aurochs.json?raw";
import cavalierText from "../../../../data/creatures/cavalier.json?raw";
import championText from "../../../../data/creatures/champion.json?raw";
import eagleText from "../../../../data/creatures/eagle.json?raw";
import entText from "../../../../data/creatures/ent.json?raw";
import falconText from "../../../../data/creatures/falcon.json?raw";
import griffinText from "../../../../data/creatures/griffin.json?raw";
import huntressText from "../../../../data/creatures/huntress.json?raw";
import kentaurText from "../../../../data/creatures/kentaur.json?raw";
import militiaText from "../../../../data/creatures/militia.json?raw";
import boarText from "../../../../data/creatures/boar.json?raw";
import dragonAzureText from "../../../../data/creatures/dragon-azure.json?raw";
import dragonCrystalText from "../../../../data/creatures/dragon-crystal.json?raw";
import dragonFairieText from "../../../../data/creatures/dragon-fairie.json?raw";
import dragonRustText from "../../../../data/creatures/dragon-rust.json?raw";
import enchanterText from "../../../../data/creatures/enchanter.json?raw";
import golemDiamondText from "../../../../data/creatures/golem-diamond.json?raw";
import golemGoldText from "../../../../data/creatures/golem-gold.json?raw";
import halflingText from "../../../../data/creatures/halfling.json?raw";
import mummyText from "../../../../data/creatures/mummy.json?raw";
import nomadText from "../../../../data/creatures/nomad.json?raw";
import peasantText from "../../../../data/creatures/peasant.json?raw";
import rogueText from "../../../../data/creatures/rogue.json?raw";
import sharpshooterText from "../../../../data/creatures/sharpshooter.json?raw";
import trollText from "../../../../data/creatures/troll.json?raw";
import slingerText from "../../../../data/creatures/slinger.json?raw";
import wardenText from "../../../../data/creatures/warden.json?raw";
import wyvernText from "../../../../data/creatures/wyvern.json?raw";
import heroesText from "../../../../data/heroes.yaml?raw";
import spellsText from "../../../../data/spells.yaml?raw";
import defaultsText from "../../../../data/defaults.yaml?raw";

const DEFAULTS_FILE = "data/defaults.yaml";
const SPELLS_FILE = "data/spells.yaml";

const BUILDINGS_FILE = "data/buildings.yaml";
const HEROES_FILE = "data/heroes.yaml";

const CREATURE_FILES = [
  { file: "data/creatures/armsman.json", text: armsmanText },
  { file: "data/creatures/aurochs.json", text: aurochsText },
  { file: "data/creatures/boar.json", text: boarText },
  { file: "data/creatures/cavalier.json", text: cavalierText },
  { file: "data/creatures/champion.json", text: championText },
  { file: "data/creatures/dragon-azure.json", text: dragonAzureText },
  { file: "data/creatures/dragon-crystal.json", text: dragonCrystalText },
  { file: "data/creatures/dragon-fairie.json", text: dragonFairieText },
  { file: "data/creatures/dragon-rust.json", text: dragonRustText },
  { file: "data/creatures/eagle.json", text: eagleText },
  { file: "data/creatures/enchanter.json", text: enchanterText },
  { file: "data/creatures/ent.json", text: entText },
  { file: "data/creatures/falcon.json", text: falconText },
  { file: "data/creatures/golem-diamond.json", text: golemDiamondText },
  { file: "data/creatures/golem-gold.json", text: golemGoldText },
  { file: "data/creatures/griffin.json", text: griffinText },
  { file: "data/creatures/halfling.json", text: halflingText },
  { file: "data/creatures/huntress.json", text: huntressText },
  { file: "data/creatures/kentaur.json", text: kentaurText },
  { file: "data/creatures/militia.json", text: militiaText },
  { file: "data/creatures/mummy.json", text: mummyText },
  { file: "data/creatures/nomad.json", text: nomadText },
  { file: "data/creatures/peasant.json", text: peasantText },
  { file: "data/creatures/rogue.json", text: rogueText },
  { file: "data/creatures/sharpshooter.json", text: sharpshooterText },
  { file: "data/creatures/slinger.json", text: slingerText },
  { file: "data/creatures/troll.json", text: trollText },
  { file: "data/creatures/warden.json", text: wardenText },
  { file: "data/creatures/wyvern.json", text: wyvernText },
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
