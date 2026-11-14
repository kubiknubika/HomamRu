/** Проверочные бои для пунктов меню: читает файл боя и файлы существ. */
import { createBattle } from "@homamru/core";
import type { BattleState } from "@homamru/core";
import { parseBattleFile } from "@homamru/data";
import siegeText from "../../../../data/battles/trial-siege.yaml?raw";
import trialText from "../../../../data/battles/trial.yaml?raw";
import { failContent, loadCreatures } from "../game/content.ts";

const FILES = {
  field: { file: "data/battles/trial.yaml", text: trialText },
  siege: { file: "data/battles/trial-siege.yaml", text: siegeText },
} as const;

export type TrialKind = keyof typeof FILES;

/** Начинает проверочный бой: обычный или осаду. Ошибка в файлах — исключение. */
export function startTrialBattle(seed: number, kind: TrialKind = "field"): BattleState {
  const { file: BATTLE_FILE, text } = FILES[kind];
  const creatures = loadCreatures();
  const battle = parseBattleFile(BATTLE_FILE, text);
  if (!battle.ok) {
    return failContent(battle.errors);
  }
  const created = createBattle(battle.value, creatures, seed);
  if (!created.ok) {
    return failContent(created.errors.map((error) => ({ file: BATTLE_FILE, ...error })));
  }
  return created.state;
}
