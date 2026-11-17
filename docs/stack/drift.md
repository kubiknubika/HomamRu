# Карта дрейфа: где память модели устарела

Проект использует свежие версии библиотек. Модель может помнить более старые. Здесь для каждой библиотеки перечислено, что изменилось, и указано, где читать подробности.

Версии на 2026-11-17. Подробности — в `docs/vendor/`, указатель — в `docs/vendor/README.md`. Строки ниже сверены с этими копиями и с установленными пакетами, а не с памятью; где что-то не подтвердилось — рядом написано, чем сверено.

## Phaser 4.2.1

Отдельный файл: `docs/stack/phaser-4-vs-3.md` (таблица сверена с типами `phaser.d.ts` 4.2.1).

## TypeScript 7.0

- Компилятор переписан на Go. Команда `tsc` та же, проверка типов намного быстрее.
- Устаревшее в 6.0 в новом проекте не используется: `target: es5`, `moduleResolution: node` и `classic`, `baseUrl`, `outFile`, форматы модулей `amd`, `umd`, `systemjs`, `esModuleInterop: false`, слово `asserts` в импортах.
- Значения по умолчанию изменились в 6.0: `types` теперь пустой список, `rootDir` — папка с `tsconfig.json` (раньше выводился по общим папкам входных файлов). Нужные типы перечисляются явно. У нас в `tsconfig.base.json` так и стоит `"types": []`, а `@types/node` подключается там, где нужен.
- `target` по умолчанию — последняя версия ECMAScript (сейчас `es2025`); у нас задан явно — `ES2023`.
- Подробности: `docs/vendor/typescript/release-notes-6.0.md`, разделы «`types` now defaults to `[]`», «`rootDir` now defaults to `.`» и «Breaking Changes and Deprecations»; отличия нового компилятора — `CHANGES-7.0.md`; настройки — `tsconfig/`.

## Vite 8

- Сборщик теперь Rolldown (вместо Rollup), преобразование и сжатие кода делает Oxc (вместо esbuild). Оптимизация зависимостей тоже перешла на Rolldown.
- Объектная форма `build.rollupOptions.output.manualChunks` удалена; функция формы объявлена устаревшей. Взамен — `codeSplitting` у Rolldown.
- `esbuild` больше не ставится вместе с Vite: если понадобится `transformWithEsbuild` или `build.minify: 'esbuild'`, его нужно добавить в зависимости отдельно.
- Подробности: `docs/vendor/vite/guide/migration.md`, разделы «Rolldown», «JavaScript Transforms by Oxc», «Removed object form `build.rollupOptions.output.manualChunks`».

## Vitest 5

- `clearMocks` включён по умолчанию.
- Проверка без `await` там, где он нужен, теперь проваливает тест.
- `test.sequential` и `describe.sequential` удалены; вместо них `concurrent: false`.
- Вызовы `vi.mock` и `vi.hoisted` должны стоять на верхнем уровне файла: внутри функции или `describe` теперь ошибка, а не предупреждение.
- Отчёты и служебные файлы пишутся в папку `.vitest` (она в `.gitignore`).
- Файл настроек больше не ищется в родительских папках: из подпапки `vitest` не подхватит корневой `vitest.config.ts`.
- `vite` больше не прямая зависимость Vitest, а обязательная соседняя: у нас `vite` объявлен в `packages/client`, а корневой `vitest` работает через него.
- Подробности: `docs/vendor/vitest/guide/migration/index.md`.

## Zod 4

- Сообщения об ошибках: вместо `message`, `invalid_type_error`, `required_error` и `errorMap` — единый параметр `error`.
- Форматы строк — отдельные функции: `z.email()`, `z.uuid()` вместо `z.string().email()`. `z.uuid()` стал строже (вариантные биты по RFC 9562/4122); для более мягкой проверки — `z.guid()`.
- `.strict()` и `.passthrough()` устарели: вместо них `z.strictObject()` и `z.looseObject()`.
- `.merge()` устарел: вместо него `.extend()`.
- `z.nativeEnum()` устарел: вместо него `z.enum()`.
- `z.record()` с одним аргументом не работает: нужны и ключ, и значение.
- `.deepPartial()` удалён.
- Подробности: `docs/vendor/zod/v4/changelog.mdx`.

## React 19

- `ref` передаётся обычным свойством; `forwardRef` больше не нужен (но пока не удалён — удалят в будущих версиях).
- `useRef` требует аргумент (это изменение типов, а не поведения во время работы).
- Удалены `ReactDOM.render`, `propTypes`, `defaultProps` у функций, строковые `ref`. Вместо `ReactDOM.render` — `createRoot` из `react-dom/client`.
- Подробности: `docs/vendor/react/react-19-upgrade-guide.md`, новое в 19.2 и 19.3 — в соседних файлах.

## Capacitor 8

- Нужен Node.js 22 или новее.
- Нужен Android Studio Otter (2025.2.1) или новее; Gradle-плагин поднимается до 8.13.0 — руководство показывает это отдельным шагом. У нас так и стоит: плагин `com.android.tools.build:gradle` 8.13.0, Gradle 8.14.3, шаблон проекта из `@capacitor/cli` 8.6.0. Отдельного требования к Kotlin в руководстве по переходу нет — Kotlin-кода в проекте тоже нет.
- Есть отдельное руководство по играм на Phaser: `docs/vendor/capacitor/guides/games.md`.
- Подробности: `docs/vendor/capacitor/updating/8-0.md`.

## pnpm 12

- В версии 11 изменилось чтение настроек, часть настроек удалена.
- В версии 12 неизвестная настройка — ошибка.
- `pnpm licenses ls` без `--recursive` считает только корень рабочего пространства: на нашем дереве это 61 пакет вместо 166 и без Blue Oak и Unlicense. Для полной картины — `pnpm licenses ls --recursive`.
- Подробности: `docs/vendor/pnpm/migration.md` и `migration-v11.md`.

## Tauri 2

- Понадобится для Windows, пока не используется. Версия 2 сильно отличается от версии 1 (настройки, права доступа, плагины).
- Подробности: `docs/vendor/tauri/`.

## Oxlint и Oxfmt

- Быстро меняются; Oxfmt ещё не дошёл до версии 1.0. Версии закрепляются точно (сейчас 1.93.0 и 0.78.0).
- Документация не скопирована. Раньше здесь было сказано «нет лицензии» — неточно: MIT есть у кода (`oxc-project/oxc`), а лицензии нет у репозитория сайта с документацией (`oxc-project/website`). Копировать её всё равно нельзя (догма 1). Настройки сверяются со схемой в самом пакете: `node_modules/oxlint/configuration_schema.json` и `node_modules/oxfmt/configuration_schema.json`.
- Подробности и ссылки на сайт — `docs/vendor/README.md`.

## Knip 6

- В песочнице с малым объёмом памяти Knip падает с ошибкой `Array buffer allocation failed`. Причина описана в его же документации («Raw transfer memory errors»): oxc-parser передаёт дерево разбора через буфер больше 4 ГиБ, и при нехватке памяти это ломается. Поэтому в `package.json` Knip запускается с `KNIP_DISABLE_RAW_TRANSFER=1` — тогда он идёт обычным путём разбора.
- Подробности: `docs/vendor/knip/reference/known-issues.md`, `docs/vendor/knip/reference/cli.md`.

## GitHub Actions

- pnpm ставится действием `pnpm/setup`: оно само ставит Node.js и зависимости. Старые `pnpm/action-setup` плюс `actions/setup-node` не нужны.
- У нас действия закреплены по полному хешу коммита с подписью версии: `actions/checkout` 7.0.1, `actions/setup-java` 6.2.0, `actions/upload-artifact` 7.0.2, `pnpm/setup` 3.1.2. Так тег не подменят.
- Подробности: `docs/vendor/pnpm/continuous-integration.md`.

## Как пополнять этот файл

Агент ошибся из-за устаревших знаний о библиотеке — добавь сюда строку в той же задаче. Строку лучше сразу сверять с копией в `docs/vendor/` и с типами установленного пакета: за эту порцию три утверждения из этого файла оказались неточными.
