/**
 * Файлы существ игры для клиента (`?raw`): сто сорок одно существо, по алфавиту путей.
 * Отдельный файл: в `content.ts` к этому времени стало больше предела в 300 строк, а здесь
 * список файлов — самая большая и самая однородная его часть.
 */
import armsmanText from "../../../../data/creatures/armsman.json?raw";
import aurochsText from "../../../../data/creatures/aurochs.json?raw";
import blackdragonText from "../../../../data/creatures/blackdragon.json?raw";
import bonedragonText from "../../../../data/creatures/bonedragon.json?raw";
import impfamiliarText from "../../../../data/creatures/imp-familiar.json?raw";
import demonlingmagogText from "../../../../data/creatures/demonling-magog.json?raw";
import houndcerberusText from "../../../../data/creatures/hound-cerberus.json?raw";
import horneddemonText from "../../../../data/creatures/horned-demon.json?raw";
import fiendlordText from "../../../../data/creatures/fiend-lord.json?raw";
import efreetsultanText from "../../../../data/creatures/efreet-sultan.json?raw";
import archfienddevilText from "../../../../data/creatures/archfiend-devil.json?raw";
import troglodyteinfernalText from "../../../../data/creatures/troglodyte-infernal.json?raw";
import harpyhagText from "../../../../data/creatures/harpy-hag.json?raw";
import eyeevilText from "../../../../data/creatures/eye-evil.json?raw";
import medusaqueenText from "../../../../data/creatures/medusa-queen.json?raw";
import minotaurkingText from "../../../../data/creatures/minotaur-king.json?raw";
import manticorescorpicoreText from "../../../../data/creatures/manticore-scorpicore.json?raw";
import blackdragonredText from "../../../../data/creatures/blackdragon-red.json?raw";
import skeletonwarriorText from "../../../../data/creatures/skeleton-warrior.json?raw";
import zombielordText from "../../../../data/creatures/zombie-lord.json?raw";
import wraithText from "../../../../data/creatures/wraith.json?raw";
import vampirelordText from "../../../../data/creatures/vampire-lord.json?raw";
import powerlichText from "../../../../data/creatures/power-lich.json?raw";
import dreadknightText from "../../../../data/creatures/dread-knight.json?raw";
import ghostdragonText from "../../../../data/creatures/ghost-dragon.json?raw";
import kentaurelderText from "../../../../data/creatures/kentaur-elder.json?raw";
import huntressrangerText from "../../../../data/creatures/huntress-ranger.json?raw";
import eaglestormText from "../../../../data/creatures/eagle-storm.json?raw";
import entancientText from "../../../../data/creatures/ent-ancient.json?raw";
import wardenstoneText from "../../../../data/creatures/warden-stone.json?raw";
import wyvernroyalText from "../../../../data/creatures/wyvern-royal.json?raw";
import aurochskingText from "../../../../data/creatures/aurochs-king.json?raw";
import gnomeruneText from "../../../../data/creatures/gnome-rune.json?raw";
import gargoyleobsidianText from "../../../../data/creatures/gargoyle-obsidian.json?raw";
import golemmithrilText from "../../../../data/creatures/golem-mithril.json?raw";
import magearchText from "../../../../data/creatures/mage-arch.json?raw";
import geniepashaText from "../../../../data/creatures/genie-pasha.json?raw";
import nagaempressText from "../../../../data/creatures/naga-empress.json?raw";
import giantstormText from "../../../../data/creatures/giant-storm.json?raw";
import militiavetText from "../../../../data/creatures/militia-vet.json?raw";
import slingeraceText from "../../../../data/creatures/slinger-ace.json?raw";
import falcongoldText from "../../../../data/creatures/falcon-gold.json?raw";
import armsmanguardText from "../../../../data/creatures/armsman-guard.json?raw";
import cavalierlanceText from "../../../../data/creatures/cavalier-lance.json?raw";
import championpaladinText from "../../../../data/creatures/champion-paladin.json?raw";
import griffinsilverText from "../../../../data/creatures/griffin-silver.json?raw";
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
import goblinRaiderText from "../../../../data/creatures/goblin-raider.json?raw";
import wolfriderAlphaText from "../../../../data/creatures/wolfrider-alpha.json?raw";
import orcThrowerText from "../../../../data/creatures/orc-thrower.json?raw";
import ogreBruteText from "../../../../data/creatures/ogre-brute.json?raw";
import rocThunderText from "../../../../data/creatures/roc-thunder.json?raw";
import cyclopLordText from "../../../../data/creatures/cyclop-lord.json?raw";
import behemothAncientText from "../../../../data/creatures/behemoth-ancient.json?raw";
import gnollHunterText from "../../../../data/creatures/gnoll-hunter.json?raw";
import lizardmanCrossbowText from "../../../../data/creatures/lizardman-crossbow.json?raw";
import serpentflyWaspText from "../../../../data/creatures/serpentfly-wasp.json?raw";
import basiliskAncientText from "../../../../data/creatures/basilisk-ancient.json?raw";
import gorgonQueenText from "../../../../data/creatures/gorgon-queen.json?raw";
import bogwyvernDrakeText from "../../../../data/creatures/bogwyvern-drake.json?raw";
import hydraAncientText from "../../../../data/creatures/hydra-ancient.json?raw";
import pixieRadiantText from "../../../../data/creatures/pixie-radiant.json?raw";
import airelemStormText from "../../../../data/creatures/airelem-storm.json?raw";
import waterelemFrostText from "../../../../data/creatures/waterelem-frost.json?raw";
import earthlemGraniteText from "../../../../data/creatures/earthlem-granite.json?raw";
import fireelemBlazeText from "../../../../data/creatures/fireelem-blaze.json?raw";
import psychelemWillText from "../../../../data/creatures/psychelem-will.json?raw";
import phoenixEternalText from "../../../../data/creatures/phoenix-eternal.json?raw";

export const CREATURE_FILES = [
  { file: "data/creatures/archfiend.json", text: archfiendText },
  { file: "data/creatures/armsman.json", text: armsmanText },
  { file: "data/creatures/aurochs.json", text: aurochsText },
  { file: "data/creatures/bonedragon.json", text: bonedragonText },
  { file: "data/creatures/imp-familiar.json", text: impfamiliarText },
  { file: "data/creatures/demonling-magog.json", text: demonlingmagogText },
  { file: "data/creatures/hound-cerberus.json", text: houndcerberusText },
  { file: "data/creatures/horned-demon.json", text: horneddemonText },
  { file: "data/creatures/fiend-lord.json", text: fiendlordText },
  { file: "data/creatures/efreet-sultan.json", text: efreetsultanText },
  { file: "data/creatures/archfiend-devil.json", text: archfienddevilText },
  { file: "data/creatures/troglodyte-infernal.json", text: troglodyteinfernalText },
  { file: "data/creatures/harpy-hag.json", text: harpyhagText },
  { file: "data/creatures/eye-evil.json", text: eyeevilText },
  { file: "data/creatures/medusa-queen.json", text: medusaqueenText },
  { file: "data/creatures/minotaur-king.json", text: minotaurkingText },
  { file: "data/creatures/manticore-scorpicore.json", text: manticorescorpicoreText },
  { file: "data/creatures/blackdragon-red.json", text: blackdragonredText },
  { file: "data/creatures/skeleton-warrior.json", text: skeletonwarriorText },
  { file: "data/creatures/zombie-lord.json", text: zombielordText },
  { file: "data/creatures/wraith.json", text: wraithText },
  { file: "data/creatures/vampire-lord.json", text: vampirelordText },
  { file: "data/creatures/power-lich.json", text: powerlichText },
  { file: "data/creatures/dread-knight.json", text: dreadknightText },
  { file: "data/creatures/ghost-dragon.json", text: ghostdragonText },
  { file: "data/creatures/kentaur-elder.json", text: kentaurelderText },
  { file: "data/creatures/huntress-ranger.json", text: huntressrangerText },
  { file: "data/creatures/eagle-storm.json", text: eaglestormText },
  { file: "data/creatures/ent-ancient.json", text: entancientText },
  { file: "data/creatures/warden-stone.json", text: wardenstoneText },
  { file: "data/creatures/wyvern-royal.json", text: wyvernroyalText },
  { file: "data/creatures/aurochs-king.json", text: aurochskingText },
  { file: "data/creatures/gnome-rune.json", text: gnomeruneText },
  { file: "data/creatures/gargoyle-obsidian.json", text: gargoyleobsidianText },
  { file: "data/creatures/golem-mithril.json", text: golemmithrilText },
  { file: "data/creatures/mage-arch.json", text: magearchText },
  { file: "data/creatures/genie-pasha.json", text: geniepashaText },
  { file: "data/creatures/naga-empress.json", text: nagaempressText },
  { file: "data/creatures/giant-storm.json", text: giantstormText },
  { file: "data/creatures/militia-vet.json", text: militiavetText },
  { file: "data/creatures/slinger-ace.json", text: slingeraceText },
  { file: "data/creatures/falcon-gold.json", text: falcongoldText },
  { file: "data/creatures/armsman-guard.json", text: armsmanguardText },
  { file: "data/creatures/cavalier-lance.json", text: cavalierlanceText },
  { file: "data/creatures/champion-paladin.json", text: championpaladinText },
  { file: "data/creatures/griffin-silver.json", text: griffinsilverText },
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
  { file: "data/creatures/goblin-raider.json", text: goblinRaiderText },
  { file: "data/creatures/wolfrider-alpha.json", text: wolfriderAlphaText },
  { file: "data/creatures/orc-thrower.json", text: orcThrowerText },
  { file: "data/creatures/ogre-brute.json", text: ogreBruteText },
  { file: "data/creatures/roc-thunder.json", text: rocThunderText },
  { file: "data/creatures/cyclop-lord.json", text: cyclopLordText },
  { file: "data/creatures/behemoth-ancient.json", text: behemothAncientText },
  { file: "data/creatures/gnoll-hunter.json", text: gnollHunterText },
  { file: "data/creatures/lizardman-crossbow.json", text: lizardmanCrossbowText },
  { file: "data/creatures/serpentfly-wasp.json", text: serpentflyWaspText },
  { file: "data/creatures/basilisk-ancient.json", text: basiliskAncientText },
  { file: "data/creatures/gorgon-queen.json", text: gorgonQueenText },
  { file: "data/creatures/bogwyvern-drake.json", text: bogwyvernDrakeText },
  { file: "data/creatures/hydra-ancient.json", text: hydraAncientText },
  { file: "data/creatures/pixie-radiant.json", text: pixieRadiantText },
  { file: "data/creatures/airelem-storm.json", text: airelemStormText },
  { file: "data/creatures/waterelem-frost.json", text: waterelemFrostText },
  { file: "data/creatures/earthlem-granite.json", text: earthlemGraniteText },
  { file: "data/creatures/fireelem-blaze.json", text: fireelemBlazeText },
  { file: "data/creatures/psychelem-will.json", text: psychelemWillText },
  { file: "data/creatures/phoenix-eternal.json", text: phoenixEternalText },
] as const;
