/**
 * Хранилище сохранений в личной папке приложения (Android).
 * Вынесено из `saveStorage.ts` отдельной функцией с внешним «файловым» слоем,
 * чтобы поведение читалось тестами: подменить Capacitor в браузерном прогоне нельзя.
 * Спецификация: docs/mechanics/04-save.md, раздел «Где хранится».
 */
import { Directory, Encoding } from "@capacitor/filesystem";
import type { SaveStorage } from "./saveStorage.ts";

export const SAVE_NAMES = ["save-0.txt", "save-1.txt"] as const;

/**
 * Код дополнения «Файлы» для «такого файла нет» — `FilesystemErrors.doesNotExist`
 * в `FilesystemErrors.kt`. Единственный отказ, который значит «сохранения нет»;
 * остальные (нет прав, неверный путь) — настоящие ошибки хранилища.
 */
export const FILE_NOT_FOUND = "OS-PLUG-FILE-0008";

/** Отказ означает «файла нет», а не поломку хранилища. */
export function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === FILE_NOT_FOUND
  );
}

/** Только те три вызова дополнения «Файлы», которые нужны сохранению. */
export interface FileLayer {
  /** Имена файлов в личной папке; `null`, если папку прочитать не удалось. */
  list(directory: Directory): Promise<string[] | null>;
  /** Текст файла; `null`, если файла нет. Другие ошибки — исключением. */
  readFile(path: string, directory: Directory, encoding: Encoding): Promise<string | null>;
  writeFile(path: string, data: string, directory: Directory, encoding: Encoding): Promise<void>;
}

/**
 * Хранилище поверх файлового слоя.
 *
 * Имя копии и путь чтения — одно и то же: раньше наличие файла проверялось по
 * имени, а читался он по пустому пути, и на Android сохранение не поднималось
 * ни разу. Проверка `list` больше не нужна: `readFile` на отсутствующем файле
 * отвечает `null`, а не исключением.
 */
export function createFileStorage(layer: FileLayer): SaveStorage {
  return {
    read: async (slot) => {
      const path = SAVE_NAMES[slot];
      const names = await layer.list(Directory.Data);
      if (names !== null && !names.includes(path)) {
        return null;
      }
      return layer.readFile(path, Directory.Data, Encoding.UTF8);
    },
    write: async (slot, text) => {
      await layer.writeFile(SAVE_NAMES[slot], text, Directory.Data, Encoding.UTF8);
    },
  };
}
