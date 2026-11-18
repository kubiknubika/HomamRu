/**
 * Хранилище сохранений: две копии текста. Реализаций две — файл в личной папке
 * приложения (Android) и хранилище браузера (превью).
 * Спецификация: docs/mechanics/04-save.md, раздел «Где хранится».
 */
import { Capacitor } from "@capacitor/core";
import type { SaveSlot } from "@homamru/data";
import { Filesystem } from "@capacitor/filesystem";
import { SAVE_NAMES, createFileStorage, isMissingFile } from "./fileSaveStorage.ts";
import type { FileLayer } from "./fileSaveStorage.ts";

export interface SaveStorage {
  /** Текст копии; `null`, если копии нет. */
  read(slot: SaveSlot): Promise<string | null>;
  write(slot: SaveSlot, text: string): Promise<void>;
}

const fileLayer: FileLayer = {
  list: async (directory) => {
    try {
      const { files } = await Filesystem.readdir({ path: "", directory });
      return files.map((file) => file.name);
    } catch {
      // Папка не читается — тогда решает сам `readFile`.
      return null;
    }
  },
  readFile: async (path, directory, encoding) => {
    try {
      const file = await Filesystem.readFile({ path, directory, encoding });
      return typeof file.data === "string" ? file.data : null;
    } catch (error) {
      // Файла нет — это не ошибка, а «сохранения нет». Отказ прав и прочее
      // пробрасываем: иначе игра молча начала бы новую партию поверх старой.
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }
  },
  writeFile: async (path, data, directory, encoding) => {
    await Filesystem.writeFile({ path, data, directory, encoding });
  },
};

const fileStorage: SaveStorage = createFileStorage(fileLayer);

const browserStorage: SaveStorage = {
  read: (slot) => Promise.resolve(localStorage.getItem(`homamru-${SAVE_NAMES[slot]}`)),
  write: (slot, text) => {
    localStorage.setItem(`homamru-${SAVE_NAMES[slot]}`, text);
    return Promise.resolve();
  },
};

/** Хранилище для текущей платформы. */
export function pickStorage(): SaveStorage {
  return Capacitor.isNativePlatform() ? fileStorage : browserStorage;
}
