/**
 * Запись автосохранения: упаковка в текст, проверка, выбор из двух копий.
 * Здесь нет работы с хранилищем: текст читает и пишет клиент.
 * Спецификация: docs/mechanics/04-save.md.
 */
import { replay, STATE_VERSION } from "@homamru/core";
import type { Command, GameState } from "@homamru/core";
import { z } from "zod";
import type { SaveDefaults } from "./defaults.ts";
import { readState } from "./state.ts";
import { commandSchema } from "./stateSchemas.ts";

/**
 * Версия формата сохранения. Увеличивается при любом изменении состава записи.
 * Пишется в запись для дампа; на загрузку не влияет.
 */
export const SAVE_FORMAT = 1;

/** Содержимое сохранения без служебных полей. */
export interface SaveBody {
  /** Версия игры, которая сделала запись. */
  readonly gameVersion: string;
  /** Состояние в начале партии. */
  readonly initial: GameState;
  /** Все принятые команды по порядку. */
  readonly commands: readonly Command[];
  /** Текущее состояние: из него партия продолжается. */
  readonly state: GameState;
}

interface SaveRecord extends SaveBody {
  /** Порядковый номер записи: у более свежей он больше. */
  readonly seq: number;
  /**
   * При чтении что-то было дописано начальным значением или убрано как незнакомое:
   * запись сделана другой версией игры.
   */
  readonly adapted: boolean;
}

/** Начальные значения служебных полей записи (таблица в 04-save.md). */
const DEFAULT_SEQ = 0;
const DEFAULT_GAME_VERSION = "неизвестно";

const recordSchema = z.object({
  seq: z.int().min(0).catch(DEFAULT_SEQ),
  gameVersion: z.string().catch(DEFAULT_GAME_VERSION),
  initial: z.unknown().optional(),
  commands: z.unknown().optional(),
  state: z.unknown().optional(),
});

/** Контрольная сумма текста: FNV-1a, 32 бита, восемь шестнадцатеричных цифр. */
function checksum(text: string): string {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Превращает запись в текст: первая строка — контрольная сумма, вторая — JSON. */
export function encodeSave(body: SaveBody, seq: number): string {
  const json = JSON.stringify({
    format: SAVE_FORMAT,
    stateVersion: STATE_VERSION,
    seq,
    gameVersion: body.gameVersion,
    initial: body.initial,
    commands: body.commands,
    state: body.state,
  });
  return `${checksum(json)}\n${json}`;
}

export type DecodeResult =
  | { readonly kind: "ok"; readonly record: SaveRecord }
  /** Запись испорчена: не сходится контрольная сумма или в ней нет того, без чего не продолжить. */
  | { readonly kind: "corrupt" };

/**
 * Разбирает текст записи. Запись с неверной контрольной суммой не загружается никогда.
 * Запись другой версии читается: недостающее берётся начальным, незнакомое убирается
 * (04-save.md, «Сохранения других версий»). `defaults` — начальные значения из контента игры.
 */
export function decodeSave(text: string, defaults: SaveDefaults): DecodeResult {
  const split = text.indexOf("\n");
  if (split < 0) {
    return { kind: "corrupt" };
  }
  const json = text.slice(split + 1);
  if (checksum(json) !== text.slice(0, split)) {
    return { kind: "corrupt" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { kind: "corrupt" };
  }
  const parsed = recordSchema.safeParse(raw);
  const state = parsed.success ? readState(parsed.data.state, defaults) : null;
  if (!parsed.success || state === null) {
    return { kind: "corrupt" };
  }
  const { seq, gameVersion } = parsed.data;
  const initial = readState(parsed.data.initial, defaults);
  const commands = z.array(commandSchema).safeParse(parsed.data.commands);
  // История годится для повтора, только если всё прочитано как записано.
  const intact =
    initial !== null &&
    commands.success &&
    sameData(state, parsed.data.state) &&
    sameData(initial, parsed.data.initial);
  if (intact) {
    return {
      kind: "ok",
      record: { seq, gameVersion, initial, commands: commands.data, state, adapted: false },
    };
  }
  return {
    kind: "ok",
    record: { seq, gameVersion, initial: state, commands: [], state, adapted: true },
  };
}

/** Номер копии сохранения: их две. */
export type SaveSlot = 0 | 1;

export type LoadResult =
  /** Сохранения нет. */
  | { readonly kind: "none" }
  | { readonly kind: "ok"; readonly record: SaveRecord; readonly slot: SaveSlot }
  | { readonly kind: "corrupt" };

/**
 * Выбирает из двух копий целую запись с большим порядковым номером.
 * `null` — копии нет. Если копии есть, но целых нет — «испорчена».
 */
export function chooseSave(
  copies: readonly [string | null, string | null],
  defaults: SaveDefaults,
): LoadResult {
  let best: { record: SaveRecord; slot: SaveSlot } | undefined;
  let sawCorrupt = false;
  for (const slot of [0, 1] as const) {
    const text = copies[slot];
    if (text === null) {
      continue;
    }
    const decoded = decodeSave(text, defaults);
    if (decoded.kind === "corrupt") {
      sawCorrupt = true;
    } else if (best === undefined || decoded.record.seq > best.record.seq) {
      best = { record: decoded.record, slot };
    }
  }
  if (best !== undefined) {
    return { kind: "ok", ...best };
  }
  return sawCorrupt ? { kind: "corrupt" } : { kind: "none" };
}

/** Сравнение обычных данных (то, что бывает в JSON) по содержимому. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every(
    (key) =>
      Object.hasOwn(b, key) &&
      sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * Проверка повтором: партия, повторённая из начального состояния и команд,
 * обязана прийти в текущее состояние. Иначе нарушен детерминизм.
 */
export function verifySave(save: SaveBody): boolean {
  const replayed = replay(save.initial, save.commands);
  return replayed.ok && sameData(replayed.state, save.state);
}
