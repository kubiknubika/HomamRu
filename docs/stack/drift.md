# Карта дрейфа: где память модели устарела

Проект использует свежие версии библиотек. Модель может помнить более старые. Здесь для каждой библиотеки перечислено, что изменилось, и указано, где читать подробности.

Версии на 2026-11-11. Подробности — в `docs/vendor/`, указатель — в `docs/vendor/README.md`.

## Phaser 4.2.1

Отдельный файл: `docs/stack/phaser-4-vs-3.md`.

## TypeScript 7.0

- Компилятор переписан на Go. Команда `tsc` та же, проверка типов намного быстрее.
- Устаревшее в 6.0 в новом проекте не используется: `target: es5`, `moduleResolution: node` и `classic`, `baseUrl`, `outFile`, форматы модулей `amd`, `umd`, `systemjs`, `esModuleInterop: false`, слово `asserts` в импортах.
- Значения по умолчанию изменились в 6.0: `types` теперь пустой список, `rootDir` — текущая папка. Нужные типы перечисляются явно.
- Подробности: `docs/vendor/typescript/release-notes-6.0.md`, раздел «Breaking Changes and Deprecations»; отличия нового компилятора — `CHANGES-7.0.md`; настройки — `tsconfig/`.

## Vite 8

- Сборщик теперь Rolldown (вместо Rollup), преобразование и сжатие кода делает Oxc (вместо esbuild).
- Объектная форма `build.rollupOptions.output.manualChunks` удалена.
- Подробности: `docs/vendor/vite/guide/migration.md`.

## Vitest 5

- `clearMocks` включён по умолчанию.
- Проверка без `await` там, где он нужен, теперь проваливает тест.
- `test.sequential` и `describe.sequential` удалены.
- Вызовы `vi.mock` и `vi.hoisted` должны стоять на верхнем уровне файла.
- Отчёты и служебные файлы пишутся в папку `.vitest`.
- Файл настроек больше не ищется в родительских папках.
- Подробности: `docs/vendor/vitest/guide/migration/index.md`.

## Zod 4

- Сообщения об ошибках: вместо `message`, `invalid_type_error`, `required_error` и `errorMap` — единый параметр `error`.
- Форматы строк — отдельные функции: `z.email()`, `z.uuid()` вместо `z.string().email()`.
- `.strict()` и `.passthrough()` устарели: вместо них `z.strictObject()` и `z.looseObject()`.
- `.merge()` устарел: вместо него `.extend()`.
- `z.nativeEnum()` устарел: вместо него `z.enum()`.
- `z.record()` с одним аргументом не работает: нужны и ключ, и значение.
- `.deepPartial()` удалён.
- Подробности: `docs/vendor/zod/v4/changelog.mdx`.

## React 19

- `ref` передаётся обычным свойством; `forwardRef` больше не нужен.
- `useRef` требует аргумент.
- Удалены `ReactDOM.render`, `propTypes`, `defaultProps` у функций, строковые `ref`.
- Подробности: `docs/vendor/react/react-19-upgrade-guide.md`, новое в 19.2 и 19.3 — в соседних файлах.

## Capacitor 8

- Нужен Node.js 22 или новее.
- Обновлены требования к Android Studio, Gradle и Kotlin.
- Есть отдельное руководство по играм на Phaser: `docs/vendor/capacitor/guides/games.md`.
- Подробности: `docs/vendor/capacitor/updating/8-0.md`.

## pnpm 12

- В версии 11 изменилось чтение настроек, часть настроек удалена.
- В версии 12 неизвестная настройка — ошибка.
- Подробности: `docs/vendor/pnpm/migration.md` и `migration-v11.md`.

## Tauri 2

- Понадобится для Windows, пока не используется. Версия 2 сильно отличается от версии 1 (настройки, права доступа, плагины).
- Подробности: `docs/vendor/tauri/`.

## Oxlint и Oxfmt

- Быстро меняются; Oxfmt ещё не дошёл до версии 1.0. Версии закрепляются точно.
- Документация не скопирована (нет лицензии). Настройки сверяются со схемой в самом пакете, см. `docs/vendor/README.md`.

## Knip 6

- В песочнице с малым объёмом памяти Knip падает с ошибкой `Array buffer allocation failed`. Поэтому в `package.json` он запускается с переменной `KNIP_DISABLE_RAW_TRANSFER=1`.

## GitHub Actions

- pnpm ставится действием `pnpm/setup`: оно само ставит Node.js и зависимости. Старые `pnpm/action-setup` плюс `actions/setup-node` не нужны.
- Подробности: `docs/vendor/pnpm/continuous-integration.md`.

## Как пополнять этот файл

Агент ошибся из-за устаревших знаний о библиотеке — добавь сюда строку в той же задаче.
