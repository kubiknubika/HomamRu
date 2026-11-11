// Проверяет границы пакетов (догма 5): ядро не зависит ни от чего,
// пакет данных не зависит от отрисовки и интерфейса (от ядра — может).
// Запуск: pnpm run boundaries
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function sourceFiles(dir) {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|mts|js|mjs)$/.test(entry.name))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

function importsOf(path) {
  const text = readFileSync(join(root, path), "utf8");
  const found = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'])([^"']+)\1/g;
  for (const match of text.matchAll(pattern)) {
    found.push(match[2]);
  }
  return found;
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

// 1. У ядра нет зависимостей.
const core = readJson("packages/core/package.json");
for (const field of DEPENDENCY_FIELDS) {
  const names = Object.keys(core[field] ?? {});
  if (names.length > 0) {
    problems.push(
      `packages/core/package.json: в ядре не должно быть зависимостей (${field}: ${names.join(", ")})`,
    );
  }
}

// 2. Код ядра импортирует только соседние файлы; тесты — ещё и vitest.
for (const file of sourceFiles("packages/core/src")) {
  const isTest = file.endsWith(".test.ts");
  for (const name of importsOf(file)) {
    const allowed =
      name.startsWith("./") || name.startsWith("../") || (isTest && name === "vitest");
    if (!allowed) {
      problems.push(`${file}: ядро не может импортировать "${name}"`);
    }
  }
}

// 3. Пакет данных не зависит от отрисовки, интерфейса и клиента.
const FORBIDDEN_IN_DATA = ["phaser", "react", "react-dom", "@homamru/client"];
const data = readJson("packages/data/package.json");
for (const field of DEPENDENCY_FIELDS) {
  for (const name of Object.keys(data[field] ?? {})) {
    if (FORBIDDEN_IN_DATA.includes(name)) {
      problems.push(`packages/data/package.json: пакет данных не может зависеть от "${name}"`);
    }
  }
}
for (const file of sourceFiles("packages/data/src")) {
  for (const name of importsOf(file)) {
    if (FORBIDDEN_IN_DATA.some((banned) => name === banned || name.startsWith(`${banned}/`))) {
      problems.push(`${file}: пакет данных не может импортировать "${name}"`);
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `Нарушены границы пакетов:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`,
  );
  process.exit(1);
}
process.stdout.write("Границы пакетов в порядке.\n");
