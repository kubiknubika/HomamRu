/** Проверочный бой для пункта меню: читает файл боя и файлы существ. */
import { createBattle } from "@homamru/core";
import type { BattleState } from "@homamru/core";
import { parseBattleFile } from "@homamru/data";
import trialText from "../../../../data/battles/trial.yaml?raw";
import { failContent, loadCreatures } from "../game/content.ts";

const BATTLE_FILE = "data/battles/trial.yaml";

/** Начинает проверочный бой. Ошибка в файлах — исключение. */
export function startTrialBattle(seed: number): BattleState {
  const creatures = loadCreatures();
  const battle = parseBattleFile(BATTLE_FILE, trialText);
  if (!battle.ok) {
    return failContent(battle.errors);
  }
  const created = createBattle(battle.value, creatures, seed);
  if (!created.ok) {
    return failContent(created.errors.map((error) => ({ file: BATTLE_FILE, ...error })));
  }
  return created.state;
}
