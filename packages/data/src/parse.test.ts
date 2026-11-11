import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseContentFile } from "./parse.ts";

// Проверочная схема только для тестов. Настоящие схемы контента появятся вместе с механиками.
const sample = z.strictObject({
  id: z.string().min(1),
  level: z.int().min(1),
  tags: z.array(z.string()),
});

describe("разбор файла контента", () => {
  it("принимает корректный JSON", () => {
    const result = parseContentFile("a.json", '{"id":"x","level":2,"tags":["t"]}', sample);
    expect(result).toEqual({ ok: true, value: { id: "x", level: 2, tags: ["t"] } });
  });

  it("принимает корректный YAML с комментарием", () => {
    const text = "# пояснение\nid: x\nlevel: 2\ntags:\n  - t\n";
    const result = parseContentFile("a.yaml", text, sample);
    expect(result).toEqual({ ok: true, value: { id: "x", level: 2, tags: ["t"] } });
  });

  it("принимает расширение .yml и не смотрит на регистр", () => {
    expect(parseContentFile("A.YML", "id: x\nlevel: 1\ntags: []\n", sample).ok).toBe(true);
  });

  it("называет файл и поле при ошибке схемы", () => {
    const result = parseContentFile("bad.json", '{"id":"x","level":0,"tags":["t",5]}', sample);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors.map((e) => `${e.file}:${e.field}`)).toEqual([
      "bad.json:level",
      "bad.json:tags.1",
    ]);
    expect(result.errors.every((e) => e.message.length > 0)).toBe(true);
  });

  it("отвергает лишние поля", () => {
    const result = parseContentFile(
      "extra.json",
      '{"id":"x","level":1,"tags":[],"oops":1}',
      sample,
    );
    expect(result.ok).toBe(false);
  });

  it("сообщает о битом JSON, не падая", () => {
    const result = parseContentFile("broken.json", "{", sample);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.file).toBe("broken.json");
    expect(result.errors[0]?.message).toContain("Не удалось разобрать файл");
  });

  it("сообщает о битом YAML, не падая", () => {
    const result = parseContentFile("broken.yaml", "id: [1, 2", sample);
    expect(result.ok).toBe(false);
  });

  it("отвергает неизвестное расширение", () => {
    const result = parseContentFile("a.toml", "id = 'x'", sample);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.message).toContain("Неизвестный формат");
  });

  it("помечает ошибку всего файла, если в нём не объект", () => {
    const result = parseContentFile("list.json", "[]", sample);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.field).toBe("(файл)");
  });
});
