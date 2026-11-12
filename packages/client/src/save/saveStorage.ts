/**
 * Хранилище сохранений: две копии текста. Реализаций две — файл в личной папке
 * приложения (Android) и хранилище браузера (превью).
 * Спецификация: docs/mechanics/04-save.md, раздел «Где хранится».
 */
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import type { SaveSlot } from "@homamru/data";

export interface SaveStorage {
  /** Текст копии; `null`, если копии нет. */
  read(slot: SaveSlot): Promise<string | null>;
  write(slot: SaveSlot, text: string): Promise<void>;
}

const NAMES = ["save-0.txt", "save-1.txt"] as const;

const fileStorage: SaveStorage = {
  read: async (slot) => {
    const path = NAMES[slot];
    const { files } = await Filesystem.readdir({ path: "", directory: Directory.Data });
    if (!files.some((file) => file.name === path)) {
      return null;
    }
    const file = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return typeof file.data === "string" ? file.data : null;
  },
  write: async (slot, text) => {
    await Filesystem.writeFile({
      path: NAMES[slot],
      data: text,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
  },
};

const browserStorage: SaveStorage = {
  read: (slot) => Promise.resolve(localStorage.getItem(`homamru-${NAMES[slot]}`)),
  write: (slot, text) => {
    localStorage.setItem(`homamru-${NAMES[slot]}`, text);
    return Promise.resolve();
  },
};

/** Хранилище для текущей платформы. */
export function pickStorage(): SaveStorage {
  return Capacitor.isNativePlatform() ? fileStorage : browserStorage;
}
