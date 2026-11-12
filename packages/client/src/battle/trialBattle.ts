/** Проверочный бой для пункта меню: читает файл боя и файлы существ. */
import { createBattle } from "@homamru/core";
import type { BattleState } from "@homamru/core";
import { parseBattleFile, parseCreatureFile } from "@homamru/data";
import trialText from "../../../../data/battles/trial.yaml?raw";
import falconText from "../../../../data/creatures/falcon.json?raw";
import militiaText from "../../../../data/creatures/militia.json?raw";
import slingerText from "../../../../data/creatures/slinger.json?raw";

const BATTLE_FILE = "data/battles/trial.yaml";

const CREATURE_FILES = [
  { file: "data/creatures/falcon.json", text: falconText },
  { file: "data/creatures/militia.json", text: militiaText },
  { file: "data/creatures/slinger.json", text: slingerText },
] as const;

interface FileError {
  readonly file: string;
  readonly field: string;
  readonly message: string;
}

function fail(errors: readonly FileError[]): never {
  throw new Error(errors.map((e) => `${e.file}: ${e.field}: ${e.message}`).join("\n"));
}

/** Начинает проверочный бой. Ошибка в файлах — исключение. */
export function startTrialBattle(seed: number): BattleState {
  const creatures = CREATURE_FILES.map((entry) => {
    const parsed = parseCreatureFile(entry.file, entry.text);
    return parsed.ok ? parsed.value : fail(parsed.errors);
  });
  const battle = parseBattleFile(BATTLE_FILE, trialText);
  if (!battle.ok) {
    return fail(battle.errors);
  }
  const created = createBattle(battle.value, creatures, seed);
  if (!created.ok) {
    return fail(created.errors.map((error) => ({ file: BATTLE_FILE, ...error })));
  }
  return created.state;
}
