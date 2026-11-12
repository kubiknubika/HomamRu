/**
 * Дамп ошибки: один файл JSON, по которому агент воспроизводит ситуацию.
 * Спецификация: docs/mechanics/05-diagnostics.md, раздел «Дамп ошибки».
 */
import { replay, STATE_VERSION } from "@homamru/core";
import type { GameEvent } from "@homamru/core";
import { z } from "zod";
import { SAVE_FORMAT } from "./save.ts";
import type { SaveBody } from "./save.ts";
import { commandSchema, gameStateSchema } from "./state.ts";

/** В журнал дампа попадают события стольких последних команд. */
export const DUMP_JOURNAL_COMMANDS = 200;

const DUMP_KIND = "homamru-dump";

export interface DumpError {
  readonly message: string;
  /** Место ошибки: стек вызовов, если он есть. */
  readonly stack: string | null;
}

export interface DumpDevice {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly pixelRatio: number;
  /** Система: `android` или `web`. */
  readonly platform: string;
  /** Строка браузера: в ней версия системы и модель устройства. */
  readonly userAgent: string;
}

export interface DumpInput {
  readonly gameVersion: string;
  /** Партия; `null`, если ошибка случилась до её создания. */
  readonly save: SaveBody | null;
  readonly error: DumpError | null;
  readonly device: DumpDevice;
  /** Дата и время создания в формате ISO 8601. */
  readonly createdAt: string;
  /** Нечитаемые копии сохранения как есть — когда сохранение повреждено. */
  readonly rawSaves?: readonly (string | null)[];
}

/** События последних команд партии. Если повтор не удался — пусто. */
function journalOf(save: SaveBody): readonly GameEvent[] {
  const split = Math.max(0, save.commands.length - DUMP_JOURNAL_COMMANDS);
  const before = replay(save.initial, save.commands.slice(0, split));
  if (!before.ok) {
    return [];
  }
  const tail = replay(before.state, save.commands.slice(split));
  return tail.ok ? tail.events : [];
}

/** Собирает дамп и возвращает его текстом. */
export function buildDump(input: DumpInput): string {
  const { save } = input;
  return JSON.stringify(
    {
      kind: DUMP_KIND,
      versions: { game: input.gameVersion, state: STATE_VERSION, save: SAVE_FORMAT },
      createdAt: input.createdAt,
      error: input.error,
      device: input.device,
      game: save === null ? null : { initial: save.initial, commands: save.commands },
      state: save === null ? null : save.state,
      journal: save === null ? [] : journalOf(save),
      rawSaves: input.rawSaves ?? [],
    },
    null,
    1,
  );
}

const dumpSchema = z.looseObject({
  kind: z.literal(DUMP_KIND),
  versions: z.looseObject({ game: z.string(), state: z.int() }),
  createdAt: z.string(),
  error: z.looseObject({ message: z.string(), stack: z.string().nullable() }).nullable(),
  game: z.strictObject({ initial: gameStateSchema, commands: z.array(commandSchema) }).nullable(),
  state: gameStateSchema.nullable(),
});

export type Dump = z.infer<typeof dumpSchema>;

export type DumpParseResult =
  | { readonly ok: true; readonly dump: Dump }
  | { readonly ok: false; readonly message: string };

/** Разбирает текст дампа. */
export function parseDump(text: string): DumpParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, message: `Это не JSON: ${error instanceof Error ? error.message : ""}` };
  }
  const parsed = dumpSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: `Это не дамп игры: ${issue?.path.map(String).join(".") ?? ""}: ${issue?.message ?? ""}`,
    };
  }
  if (parsed.data.versions.state !== STATE_VERSION) {
    return {
      ok: false,
      message: `Дамп от другой версии состояния: ${parsed.data.versions.state}, а игра понимает ${STATE_VERSION}.`,
    };
  }
  return { ok: true, dump: parsed.data };
}
