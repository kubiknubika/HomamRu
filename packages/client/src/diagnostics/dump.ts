/**
 * Дамп ошибки на стороне клиента: сбор сведений и выгрузка файла.
 * Спецификация: docs/mechanics/05-diagnostics.md, раздел «Дамп ошибки».
 */
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { buildDump } from "@homamru/data";
import type { DumpError, SaveBody } from "@homamru/data";
import { GAME_VERSION } from "./version.ts";

/** Что сейчас известно о партии. Обновляется игрой, читается при создании дампа. */
interface DumpSource {
  save: SaveBody | null;
  /** Копии сохранения как есть — если их не удалось прочитать. */
  rawSaves: readonly (string | null)[];
}

export const dumpSource: DumpSource = { save: null, rawSaves: [] };

export function toDumpError(reason: unknown): DumpError {
  if (reason instanceof Error) {
    return { message: `${reason.name}: ${reason.message}`, stack: reason.stack ?? null };
  }
  return { message: String(reason), stack: null };
}

function makeDump(error: DumpError | null): string {
  return buildDump({
    gameVersion: GAME_VERSION,
    save: dumpSource.save,
    rawSaves: dumpSource.rawSaves,
    error,
    device: {
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio,
      platform: Capacitor.getPlatform(),
      userAgent: navigator.userAgent,
    },
    createdAt: new Date().toISOString(),
  });
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Создаёт дамп и отдаёт его игроку: на телефоне — окно «Поделиться», в браузере — загрузка файла.
 * Возвращает текст неудачи или `null`, если всё получилось.
 */
export async function saveDump(error: DumpError | null): Promise<string | null> {
  try {
    const text = makeDump(error);
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    const name = `geroi-ru-dump-${stamp}.json`;
    if (!Capacitor.isNativePlatform()) {
      download(name, text);
      return null;
    }
    const file = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: "Дамп «Герои Ру»", files: [file.uri] });
    return null;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    // Игрок закрыл окно «Поделиться» — это не ошибка.
    return /cancel/i.test(message) ? null : message;
  }
}
