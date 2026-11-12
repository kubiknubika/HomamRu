/**
 * Запись автосохранения: упаковка в текст, проверка, выбор из двух копий.
 * Здесь нет работы с хранилищем: текст читает и пишет клиент.
 * Спецификация: docs/mechanics/04-save.md.
 */
import { replay, STATE_VERSION } from "@homamru/core";
import type { Command, GameState } from "@homamru/core";
import { z } from "zod";
import { commandSchema, gameStateSchema } from "./state.ts";

/** Версия формата сохранения. Увеличивается при любом изменении состава записи. */
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
}

const headSchema = z.looseObject({ format: z.int(), stateVersion: z.int() });

const recordSchema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  stateVersion: z.literal(STATE_VERSION),
  seq: z.int().min(0),
  gameVersion: z.string(),
  initial: gameStateSchema,
  commands: z.array(commandSchema),
  state: gameStateSchema,
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
  /** Запись испорчена: не сходится контрольная сумма или состав. */
  | { readonly kind: "corrupt" }
  /** Запись цела, но сделана в другом формате. */
  | { readonly kind: "old" };

/** Разбирает текст записи. Запись с неверной контрольной суммой не загружается никогда. */
export function decodeSave(text: string): DecodeResult {
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
  const head = headSchema.safeParse(raw);
  if (!head.success) {
    return { kind: "corrupt" };
  }
  if (head.data.format !== SAVE_FORMAT || head.data.stateVersion !== STATE_VERSION) {
    return { kind: "old" };
  }
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: "corrupt" };
  }
  const { seq, gameVersion, initial, commands, state } = parsed.data;
  return { kind: "ok", record: { seq, gameVersion, initial, commands, state } };
}

/** Номер копии сохранения: их две. */
export type SaveSlot = 0 | 1;

export type LoadResult =
  /** Сохранения нет. */
  | { readonly kind: "none" }
  | { readonly kind: "ok"; readonly record: SaveRecord; readonly slot: SaveSlot }
  | { readonly kind: "corrupt" }
  | { readonly kind: "old" };

/**
 * Выбирает из двух копий целую запись с большим порядковым номером.
 * `null` — копии нет. Если целых нет: «старая», когда хоть одна копия от другого формата,
 * иначе «испорчена».
 */
export function chooseSave(copies: readonly [string | null, string | null]): LoadResult {
  let best: { record: SaveRecord; slot: SaveSlot } | undefined;
  let sawOld = false;
  let sawCorrupt = false;
  for (const slot of [0, 1] as const) {
    const text = copies[slot];
    if (text === null) {
      continue;
    }
    const decoded = decodeSave(text);
    if (decoded.kind === "old") {
      sawOld = true;
    } else if (decoded.kind === "corrupt") {
      sawCorrupt = true;
    } else if (best === undefined || decoded.record.seq > best.record.seq) {
      best = { record: decoded.record, slot };
    }
  }
  if (best !== undefined) {
    return { kind: "ok", ...best };
  }
  if (sawOld) {
    return { kind: "old" };
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
