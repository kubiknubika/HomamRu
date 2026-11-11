import { parse as parseYaml } from "yaml";
import type { z } from "zod";

/** Ошибка в файле контента: какой файл, какое поле, что не так (догма 8). */
export interface ContentError {
  readonly file: string;
  readonly field: string;
  readonly message: string;
}

export type ContentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ContentError[] };

/** Поле, которым помечается ошибка, относящаяся ко всему файлу. */
const WHOLE_FILE = "(файл)";

function fail(file: string, message: string): ContentResult<never> {
  return { ok: false, errors: [{ file, field: WHOLE_FILE, message }] };
}

function readRaw(file: string, text: string): ContentResult<unknown> {
  const lower = file.toLowerCase();
  try {
    if (lower.endsWith(".json")) {
      return { ok: true, value: JSON.parse(text) as unknown };
    }
    if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
      return { ok: true, value: parseYaml(text) as unknown };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(file, `Не удалось разобрать файл: ${reason}`);
  }
  return fail(file, "Неизвестный формат: ожидается .json, .yaml или .yml");
}

/**
 * Разбирает текст файла контента (JSON или YAML — по расширению) и проверяет его по схеме.
 * Ничего не читает с диска: текст передаётся снаружи, поэтому функция работает и в браузере, и в Node.
 */
export function parseContentFile<S extends z.ZodType>(
  file: string,
  text: string,
  schema: S,
): ContentResult<z.infer<S>> {
  const raw = readRaw(file, text);
  if (!raw.ok) {
    return raw;
  }
  const parsed = schema.safeParse(raw.value);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      file,
      field: issue.path.length > 0 ? issue.path.map(String).join(".") : WHOLE_FILE,
      message: issue.message,
    })),
  };
}
