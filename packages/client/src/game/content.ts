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
import blackdragonText from "../../../../data/creatures/blackdragon.json?raw";
import bonedragonText from "../../../../data/creatures/bonedragon.json?raw";
import pixieText from "../../../../data/creatures/pixie.json?raw";
import airelemText from "../../../../data/creatures/airelem.json?raw";
import waterelemText from "../../../../data/creatures/waterelem.json?raw";
import earthlemText from "../../../../data/creatures/earthlem.json?raw";
import fireelemText from "../../../../data/creatures/fireelem.json?raw";
import psychelemText from "../../../../data/creatures/psychelem.json?raw";
import phoenixText from "../../../../data/creatures/phoenix.json?raw";
import gnollText from "../../../../data/creatures/gnoll.json?raw";
import lizardmanText from "../../../../data/creatures/lizardman.json?raw";
import serpentflyText from "../../../../data/creatures/serpentfly.json?raw";
import basiliskText from "../../../../data/creatures/basilisk.json?raw";
import gorgonText from "../../../../data/creatures/gorgon.json?raw";
import bogwyvernText from "../../../../data/creatures/bogwyvern.json?raw";
import hydraText from "../../../../data/creatures/hydra.json?raw";
import goblinText from "../../../../data/creatures/goblin.json?raw";
import wolfriderText from "../../../../data/creatures/wolfrider.json?raw";
import orcText from "../../../../data/creatures/orc.json?raw";
import ogreText from "../../../../data/creatures/ogre.json?raw";
import rocText from "../../../../data/creatures/roc.json?raw";
import cyclopText from "../../../../data/creatures/cyclop.json?raw";
import behemothText from "../../../../data/creatures/behemoth.json?raw";
import deathknightText from "../../../../data/creatures/deathknight.json?raw";
import lichText from "../../../../data/creatures/lich.json?raw";
import skeletonText from "../../../../data/creatures/skeleton.json?raw";
import vampireText from "../../../../data/creatures/vampire.json?raw";
import wightText from "../../../../data/creatures/wight.json?raw";
import zombieText from "../../../../data/creatures/zombie.json?raw";
import eyeText from "../../../../data/creatures/eye.json?raw";
import harpyText from "../../../../data/creatures/harpy.json?raw";
import manticoreText from "../../../../data/creatures/manticore.json?raw";
import medusaText from "../../../../data/creatures/medusa.json?raw";
import minotaurText from "../../../../data/creatures/minotaur.json?raw";
import troglodyteText from "../../../../data/creatures/troglodyte.json?raw";
import archfiendText from "../../../../data/creatures/archfiend.json?raw";
import demonlingText from "../../../../data/creatures/demonling.json?raw";
import efreetText from "../../../../data/creatures/efreet.json?raw";
import fiendText from "../../../../data/creatures/fiend.json?raw";
import hornedText from "../../../../data/creatures/horned.json?raw";
import houndText from "../../../../data/creatures/hound.json?raw";
import impText from "../../../../data/creatures/imp.json?raw";
import gargoyleText from "../../../../data/creatures/gargoyle.json?raw";
import genieText from "../../../../data/creatures/genie.json?raw";
import giantText from "../../../../data/creatures/giant.json?raw";
import gnomeText from "../../../../data/creatures/gnome.json?raw";
import golemText from "../../../../data/creatures/golem.json?raw";
import mageText from "../../../../data/creatures/mage.json?raw";
import nagaText from "../../../../data/creatures/naga.json?raw";
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
  { file: "data/creatures/archfiend.json", text: archfiendText },
  { file: "data/creatures/armsman.json", text: armsmanText },
  { file: "data/creatures/aurochs.json", text: aurochsText },
  { file: "data/creatures/bonedragon.json", text: bonedragonText },
  { file: "data/creatures/pixie.json", text: pixieText },
  { file: "data/creatures/airelem.json", text: airelemText },
  { file: "data/creatures/waterelem.json", text: waterelemText },
  { file: "data/creatures/earthlem.json", text: earthlemText },
  { file: "data/creatures/fireelem.json", text: fireelemText },
  { file: "data/creatures/psychelem.json", text: psychelemText },
  { file: "data/creatures/phoenix.json", text: phoenixText },
  { file: "data/creatures/gnoll.json", text: gnollText },
  { file: "data/creatures/lizardman.json", text: lizardmanText },
  { file: "data/creatures/serpentfly.json", text: serpentflyText },
  { file: "data/creatures/basilisk.json", text: basiliskText },
  { file: "data/creatures/gorgon.json", text: gorgonText },
  { file: "data/creatures/bogwyvern.json", text: bogwyvernText },
  { file: "data/creatures/hydra.json", text: hydraText },
  { file: "data/creatures/goblin.json", text: goblinText },
  { file: "data/creatures/wolfrider.json", text: wolfriderText },
  { file: "data/creatures/orc.json", text: orcText },
  { file: "data/creatures/ogre.json", text: ogreText },
  { file: "data/creatures/roc.json", text: rocText },
  { file: "data/creatures/cyclop.json", text: cyclopText },
  { file: "data/creatures/behemoth.json", text: behemothText },
  { file: "data/creatures/deathknight.json", text: deathknightText },
  { file: "data/creatures/lich.json", text: lichText },
  { file: "data/creatures/skeleton.json", text: skeletonText },
  { file: "data/creatures/vampire.json", text: vampireText },
  { file: "data/creatures/wight.json", text: wightText },
  { file: "data/creatures/zombie.json", text: zombieText },
  { file: "data/creatures/blackdragon.json", text: blackdragonText },
  { file: "data/creatures/boar.json", text: boarText },
  { file: "data/creatures/cavalier.json", text: cavalierText },
  { file: "data/creatures/champion.json", text: championText },
  { file: "data/creatures/demonling.json", text: demonlingText },
  { file: "data/creatures/dragon-azure.json", text: dragonAzureText },
  { file: "data/creatures/dragon-crystal.json", text: dragonCrystalText },
  { file: "data/creatures/dragon-fairie.json", text: dragonFairieText },
  { file: "data/creatures/dragon-rust.json", text: dragonRustText },
  { file: "data/creatures/eagle.json", text: eagleText },
  { file: "data/creatures/efreet.json", text: efreetText },
  { file: "data/creatures/enchanter.json", text: enchanterText },
  { file: "data/creatures/ent.json", text: entText },
  { file: "data/creatures/eye.json", text: eyeText },
  { file: "data/creatures/falcon.json", text: falconText },
  { file: "data/creatures/fiend.json", text: fiendText },
  { file: "data/creatures/gargoyle.json", text: gargoyleText },
  { file: "data/creatures/genie.json", text: genieText },
  { file: "data/creatures/giant.json", text: giantText },
  { file: "data/creatures/gnome.json", text: gnomeText },
  { file: "data/creatures/golem.json", text: golemText },
  { file: "data/creatures/golem-diamond.json", text: golemDiamondText },
  { file: "data/creatures/golem-gold.json", text: golemGoldText },
  { file: "data/creatures/griffin.json", text: griffinText },
  { file: "data/creatures/halfling.json", text: halflingText },
  { file: "data/creatures/harpy.json", text: harpyText },
  { file: "data/creatures/horned.json", text: hornedText },
  { file: "data/creatures/hound.json", text: houndText },
  { file: "data/creatures/huntress.json", text: huntressText },
  { file: "data/creatures/imp.json", text: impText },
  { file: "data/creatures/kentaur.json", text: kentaurText },
  { file: "data/creatures/mage.json", text: mageText },
  { file: "data/creatures/manticore.json", text: manticoreText },
  { file: "data/creatures/medusa.json", text: medusaText },
  { file: "data/creatures/militia.json", text: militiaText },
  { file: "data/creatures/minotaur.json", text: minotaurText },
  { file: "data/creatures/mummy.json", text: mummyText },
  { file: "data/creatures/naga.json", text: nagaText },
  { file: "data/creatures/nomad.json", text: nomadText },
  { file: "data/creatures/peasant.json", text: peasantText },
  { file: "data/creatures/rogue.json", text: rogueText },
  { file: "data/creatures/sharpshooter.json", text: sharpshooterText },
  { file: "data/creatures/slinger.json", text: slingerText },
  { file: "data/creatures/troglodyte.json", text: troglodyteText },
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
