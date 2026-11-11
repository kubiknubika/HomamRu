import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { checkMapFile, listMapFiles } from "./files.ts";

// Догма 8: все файлы данных проверяются автоматически.
describe("карты из папки data/maps", () => {
  const files = listMapFiles();

  it("папка не пуста", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [basename(file), file]))("%s", (_, file) => {
    expect(checkMapFile(file)).toEqual([]);
  });
});
