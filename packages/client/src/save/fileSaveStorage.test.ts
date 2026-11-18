/**
 * Свойства файлового хранилища сохранений (Android): проверяем то, что нельзя
 * увидеть в браузерном прогоне, — с каким путём идут чтение и запись.
 *
 * Свойство-сторож: копия, записанная в слот, читается из того же места.
 * Раньше наличие файла проверялось по имени, а читался он по пустому пути,
 * поэтому на телефоне сохранение не поднималось ни разу.
 */
import { Directory, Encoding } from "@capacitor/filesystem";
import { describe, expect, it } from "vitest";
import { FILE_NOT_FOUND, SAVE_NAMES, createFileStorage, isMissingFile } from "./fileSaveStorage.ts";
import type { FileLayer } from "./fileSaveStorage.ts";

/** Файлы одного каталога в памяти; ровно как ведёт себя дополнение «Файлы». */
function fakeLayer(options: { folderBroken?: boolean } = {}): FileLayer & {
  readonly files: Map<string, string>;
} {
  const files = new Map<string, string>();
  return {
    files,
    list: async () => (options.folderBroken === true ? null : [...files.keys()]),
    readFile: async (path, directory, encoding) => {
      expect(directory).toBe(Directory.Data);
      expect(encoding).toBe(Encoding.UTF8);
      // Настоящее дополнение отказывает на пустом пути: файла с таким именем нет.
      if (path === "") {
        return null;
      }
      const text = files.get(path);
      return text === undefined ? null : text;
    },
    writeFile: async (path, data, directory, encoding) => {
      expect(directory).toBe(Directory.Data);
      expect(encoding).toBe(Encoding.UTF8);
      files.set(path, data);
    },
  };
}

describe("файловое хранилище сохранений", () => {
  it("записанное в слот читается обратно", async () => {
    const storage = createFileStorage(fakeLayer());
    await storage.write(0, "первая партия");
    await storage.write(1, "вторая партия");
    await expect(storage.read(0)).resolves.toBe("первая партия");
    await expect(storage.read(1)).resolves.toBe("вторая партия");
  });

  it("пишет в файлы `save-0.txt` и `save-1.txt`", async () => {
    const layer = fakeLayer();
    const storage = createFileStorage(layer);
    await storage.write(0, "а");
    await storage.write(1, "б");
    expect([...layer.files.keys()]).toEqual([SAVE_NAMES[0], SAVE_NAMES[1]]);
  });

  it("пустой слот — это `null`, а не ошибка", async () => {
    const storage = createFileStorage(fakeLayer());
    await expect(storage.read(0)).resolves.toBeNull();
    await expect(storage.read(1)).resolves.toBeNull();
  });

  it("нечитаемая папка не мешает: решает само чтение файла", async () => {
    const storage = createFileStorage(fakeLayer({ folderBroken: true }));
    await storage.write(1, "единственная копия");
    await expect(storage.read(1)).resolves.toBe("единственная копия");
  });

  it("«файла нет» — это `null`, а «нет прав» — настоящая ошибка", async () => {
    const denied = Object.assign(new Error("нет прав"), { code: "OS-PLUG-FILE-0007" });
    const missing = Object.assign(new Error("нет файла"), { code: FILE_NOT_FOUND });
    expect(isMissingFile(missing)).toBe(true);
    expect(isMissingFile(denied)).toBe(false);
    expect(isMissingFile(null)).toBe(false);
    expect(isMissingFile(new Error("что-то ещё"))).toBe(false);
  });

  /** Главное: путь чтения — имя файла, а не пустая строка. */
  it("путь чтения совпадает с путём записи", async () => {
    const asked: string[] = [];
    const layer: FileLayer = {
      list: async () => [...SAVE_NAMES],
      readFile: (path) => {
        asked.push(path);
        return Promise.resolve(path === "" ? null : "целое");
      },
      writeFile: () => Promise.resolve(),
    };
    const storage = createFileStorage(layer);
    await storage.read(0);
    await storage.read(1);
    expect(asked).toEqual([SAVE_NAMES[0], SAVE_NAMES[1]]);
    expect(asked).not.toContain("");
  });
});
