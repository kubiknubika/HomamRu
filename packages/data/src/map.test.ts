import { describe, expect, it } from "vitest";
import { parseMapFile } from "./map.ts";

function mapText(changes: { terrainRow?: string; hero?: string; extra?: string } = {}): string {
  return [
    "id: test",
    "name: Проверочная",
    "terrain:",
    `  - "${changes.terrainRow ?? "........"}"`,
    ...Array.from({ length: 7 }, () => '  - "........"'),
    "players:",
    `  - hero: ${changes.hero ?? "{ x: 1, y: 1 }"}`,
    changes.extra ?? "",
  ].join("\n");
}

describe("файл карты", () => {
  it("разбирает верную карту", () => {
    const result = parseMapFile("data/maps/test.yaml", mapText());
    expect(result).toMatchObject({
      ok: true,
      value: { id: "test", name: "Проверочная", players: [{ hero: { x: 1, y: 1 } }] },
    });
    expect(result.ok ? result.value.terrain : []).toHaveLength(8);
  });

  it("называет файл и поле при ошибке схемы", () => {
    const result = parseMapFile("data/maps/test.yaml", mapText({ hero: "{ x: один, y: 1 }" }));
    expect(result).toMatchObject({
      ok: false,
      errors: [{ file: "data/maps/test.yaml", field: "players.0.hero.x" }],
    });
  });

  it("отвергает неизвестное поле", () => {
    const result = parseMapFile("data/maps/test.yaml", mapText({ extra: "roads: true" }));
    expect(result.ok).toBe(false);
  });

  it("отвергает идентификатор с недопустимыми символами", () => {
    const text = mapText().replace("id: test", "id: Моя Карта");
    expect(parseMapFile("data/maps/test.yaml", text)).toMatchObject({
      ok: false,
      errors: [{ field: "id" }],
    });
  });

  it("проверяет карту по смыслу и называет строку и столбец", () => {
    const result = parseMapFile("data/maps/test.yaml", mapText({ terrainRow: "...~...." }));
    expect(result).toMatchObject({
      ok: false,
      errors: [{ file: "data/maps/test.yaml", field: "terrain.0" }],
    });
    expect(result.ok ? "" : result.errors[0]?.message).toContain("строка 1, столбец 4");
  });

  it("отвергает героя на преграде", () => {
    const result = parseMapFile(
      "data/maps/test.yaml",
      mapText({ hero: "{ x: 0, y: 0 }", terrainRow: "#......." }),
    );
    expect(result).toMatchObject({ ok: false, errors: [{ field: "players.0.hero" }] });
  });
});
