# Сторонние материалы и их лицензии

Сюда записывается всё стороннее, что лежит в репозитории: ассеты, библиотеки, документация (догма 1).

Проверить нынешнее состояние можно командой `pnpm licenses ls --recursive`: на 2026-11-17 она показывает **166 пакетов**: MIT 124, ISC 17, Blue Oak 1.0.0 — 12, Apache-2.0 — 6, Unlicense — 2, MPL-2.0 — 2, BSD-3-Clause — 2, 0BSD — 1. Без `--recursive` та же команда считает только корень рабочего пространства (61 пакет) и потому врёт о целом: Blue Oak и Unlicense она тогда не показывает вовсе. В сборку клиента из этого попадают только рабочие зависимости — 12 пакетов (MIT 9, ISC 2, 0BSD 1); остальное — инструменты проверки и сборки, в игру не входят.

## Ассеты

Графика, звук и шрифты лягут в `packages/client/public/assets/` — этой папки пока нет, её создадут вместе с первым ассетом. Одна строка описывает файл или целую папку. Правила — в `docs/decisions/0005-assets.md`.

| Файл или папка | Источник | Автор | Лицензия |
|---|---|---|---|
| — | ассетов пока нет | — | — |

Игровых картинок в игре нет ни одной: всё на экране рисуется кодом (догма 14). Значок приложения и заставка к игровым ассетам не относятся — они из шаблона Android, см. ниже.

## Шаблон Android (`packages/client/android/`)

Проект Android создан командой `cap add android` из шаблона `@capacitor/cli` 8.6.0 и хранится в репозитории (`docs/architecture.md`). Сверено с шаблоном из самого пакета (он лежит в `node_modules/@capacitor/cli/assets/android-template.tar.gz`). В шаблоне 52 файла, у нас 54 из-за четырёх отличий: нет `app/build/.npmkeep`, `MainActivity.java` переехал в наш пакет, а `app/capacitor.build.gradle`, `capacitor.settings.gradle` (их пишет `cap sync`) и `debug.p12` в шаблоне отсутствуют. По содержимому своё только `AndroidManifest.xml` (альбомная ориентация), `app/build.gradle` (открытый ключ отладочной сборки), `strings.xml` (название «Герои Ру») и `MainActivity.java` (пакет `io.github.kubiknubika.homamru`). Остальное, включая все 26 картинок и 8 из 9 файлов `*.xml` в `res/`, совпадает с шаблоном побайтно.

| Файл или папка | Источник | Автор | Лицензия |
|---|---|---|---|
| `android/app/src/main/res/` — 26 файлов `*.png` (значок `ic_launcher*`, заставка `splash`) и 8 файлов `*.xml` (`ic_launcher*`, `styles`, `activity_main`, `file_paths`; девятый, `values/strings.xml`, наш — в нём название игры) | шаблон `@capacitor/cli` 8.6.0 | Ionic | MIT |
| `android/gradle/wrapper/gradle-wrapper.jar`, `gradlew`, `gradlew.bat` | Gradle 8.14.3 | Gradle Inc. | Apache-2.0 |
| `android/app/debug.p12` | наш ключ, создан для проекта | авторы проекта | не требуется: стороннего материала нет |

Что это значит на практике:

- **Значок приложения и заставка — чужие.** На телефоне «Герои Ру» открывается со значком Capacitor (синие полосы на белом) и такой же заставкой: это картинки из шаблона, своих мы не рисовали. По решению 0005 ассеты появляются вместе с первым ассетом, но значок игрок видит до запуска, поэтому это записано и в `status.md` — материал чужой, но лицензия свободная, так что нарушением он не является.
- `gradle-wrapper.jar` в репозитории — обычная практика Gradle, но лицензия у него Apache-2.0, и без записи здесь он был бы «сторонним файлом без лицензии».

## Документация в `docs/vendor/`

Копии официальной документации, без изменений. Тексты лицензий лежат рядом с копиями.

| Папка | Источник | Авторы | Лицензия |
|---|---|---|---|
| `docs/vendor/phaser/` | https://github.com/phaserjs/phaser | Phaser Studio Inc. | MIT |
| `docs/vendor/vite/` | https://github.com/vitejs/vite | VoidZero Inc. и участники Vite | MIT |
| `docs/vendor/vitest/` | https://github.com/vitest-dev/vitest | VoidZero Inc. и участники Vitest | MIT |
| `docs/vendor/zod/` | https://github.com/colinhacks/zod | Colin McDonnell | MIT |
| `docs/vendor/knip/` | https://github.com/webpro-nl/knip | Lars Kappert | ISC |
| `docs/vendor/pnpm/` | https://github.com/pnpm/pnpm.io | Zoltan Kochan и участники | MIT |
| `docs/vendor/react/` | https://github.com/reactjs/react.dev | Meta Platforms, Inc. и участники | CC BY 4.0 |
| `docs/vendor/capacitor/` | https://github.com/ionic-team/capacitor-docs | Ionic | Apache-2.0 |
| `docs/vendor/tauri/` | https://github.com/tauri-apps/tauri-docs | Tauri Programme within the Commons Conservancy | MIT |
| `docs/vendor/typescript/CHANGES-7.0.md` | https://github.com/microsoft/typescript-go | Microsoft Corporation | Apache-2.0 |
| `docs/vendor/typescript/` (остальное) | https://github.com/microsoft/TypeScript-Website | Microsoft Corporation | CC BY 4.0 |

Тексты лицензий в папках сверены с таблицей: `phaser/LICENSE.md` и `zod/LICENSE` — MIT, `knip/LICENSE` — ISC, `pnpm/LICENSE`, `tauri/LICENSE`, `vite/LICENSE`, `vitest/LICENSE` — MIT, `capacitor/LICENSE` и `typescript/LICENSE-typescript-go` — Apache-2.0, `react/LICENSE-DOCS.md` и `typescript/LICENSE-docs` — CC BY 4.0. Расхождений нет.

Документация Oxlint и Oxfmt не скопирована. Раньше здесь было сказано «у её репозитория нет лицензии» — это неточно. Лицензия MIT есть у кода: `oxc-project/oxc` (там же `npm/oxlint` и `npm/oxfmt`, и оттуда же взят `configuration_schema.json`). А сама документация живёт в репозитории сайта `oxc-project/website`, и у него лицензии нет — GitHub показывает `license: null`. Копировать её нельзя (догма 1), поэтому читаем на https://oxc.rs/docs/guide/usage/linter и https://oxc.rs/docs/guide/usage/formatter, а настройки сверяем со схемой в пакете.

## Библиотеки

Прямые зависимости проекта. В репозитории их кода нет: они ставятся командой `pnpm install`.

| Библиотека | Лицензия | Где используется |
|---|---|---|
| phaser | MIT | клиент |
| react, react-dom | MIT | клиент |
| @capacitor/core, @capacitor/cli, @capacitor/android | MIT | упаковка под Android |
| @capacitor/filesystem, @capacitor/share | MIT | файл сохранения и окно «Поделиться» на Android |
| zod | MIT | данные |
| yaml | ISC | данные |
| vite, @vitejs/plugin-react | MIT | сборка |
| vitest | MIT | тесты |
| typescript | Apache-2.0 | проверка типов |
| oxlint, oxfmt | MIT | линтер и форматтер |
| knip | ISC | поиск мёртвого кода |
| @types/react, @types/react-dom, @types/node | MIT | типы |

Лицензии взяты из `license` в `package.json` каждого пакета, а не из памяти. Расхождений с таблицей нет.

### Что приходит вместе с ними (транзитивные)

Прямых внешних зависимостей 20, а с ними приезжает 166 пакетов. Раньше в решении 0004 было записано «все зависимости под MIT, ISC или Apache-2.0» — это уже неверно, и вот что есть на самом деле:

| Лицензия | Сколько | Кто | Совместимость с GPL-3.0 |
|---|---|---|---|
| MIT | 124 | большинство | да |
| ISC | 17 | `yaml`, `picocolors`, `knip` и другие | да |
| Blue Oak 1.0.0 | 12 | `glob`, `rimraf`, `tar`, `minimatch`, `sax`, `minipass`, `lru-cache`, `path-scurry`, `chownr`, `yallist`, `package-json-from-dist`, `@isaacs/nonrecursive-glob-match` | да: разрешительная, без патентных ограничений (так её заявляет сам Blue Oak Council) |
| Apache-2.0 | 6 | `typescript`, `detect-libc`, `expect-type`, `elementtree`, `xcode`, `@typescript/typescript-linux-x64` | да, для этого и выбрана GPL-3 (а не GPL-2) |
| Unlicense | 2 | `big-integer`, `stream-buffers` (оба — через `@capacitor/cli` и `xcode`) | да: общественное достояние |
| MPL-2.0 | 2 | `lightningcss`, `lightningcss-linux-x64-gnu` (через `vite`) | да: файловый копилефт, совместим по разделу 3.3, отметки «Incompatible With Secondary Licenses» в тексте лицензии нет |
| BSD-3-Clause | 2 | `smol-toml`, `source-map-js` | да |
| 0BSD | 1 | `tslib` (через `@capacitor/*`) | да |

Два места требуют внимания:

- **MPL-2.0 у `lightningcss`.** Это единственная копилефтная зависимость в проекте, и она приезжает с `vite` (сборка CSS). MPL-2.0 совместима с GPL: раздел 3.3 разрешает распространять покрытые файлы ещё и по GPL, если в них не вложена отметка Exhibit B. В тексте лицензии `lightningcss` Exhibit B приведён пустым образцом, отметки нет — то есть условие выполняется. Если менять сборку CSS, помнить об этом.
- **Blue Oak.** Новее и чище MIT, но её нет в списке «известных» лицензий у многих проверяющих инструментов — на этом проект уже спотыкался при чтении вывода `pnpm licenses ls` (корневой режим её просто не показывает). Лицензия свободная, менять ничего не нужно; запись здесь — чтобы в следующий раз не искать заново.

### Сборка под Android

В `app/build.gradle` и `build.gradle` объявлены ещё четыре сторонних вещи. Все — Apache-2.0, кроме JUnit:

| Что | Версия | Лицензия | Где оказывается |
|---|---|---|---|
| Android Gradle Plugin (`com.android.tools.build:gradle`) | 8.13.0 | Apache-2.0 | только при сборке, в APK не входит |
| AndroidX: `appcompat` 1.7.1, `coordinatorlayout` 1.3.0, `core-splashscreen` 1.2.0 | — | Apache-2.0 | в APK |
| JUnit 4 (`junit:junit`) | 4.13.2 | **EPL-1.0** | только в местных тестах `app/src/test/`, в APK не входит |
| AndroidX Test: `androidx.test.ext:junit` 1.3.0, `espresso-core` 3.7.0 | — | Apache-2.0 | только в тестовую сборку, в APK не входит |
| `com.google.gms:google-services` | 4.4.4 | Apache-2.0 | объявлен в шаблоне, но плагин применяется только при наличии `google-services.json` — файла нет, значит не применяется |

**JUnit под EPL-1.0 — единственная лицензия в проекте, несовместимая с GPL.** Это не мешает: EPL-1.0 несовместим с GPL при распространении общего произведения, а JUnit в игру не попадает — он нужен только местным тестам `ExampleUnitTest`, которые остались от шаблона и ничего не проверяют. Держать его в `testImplementation` можно; переносить тесты в общую сборку нельзя.

## Инструменты проверки на GitHub

Запуски в `.github/workflows/` берут четыре действия, все под MIT: `actions/checkout` 7.0.1, `actions/setup-java` 6.2.0, `actions/upload-artifact` 7.0.2, `pnpm/setup` 3.1.2. В игру они не входят, работают только в CI.

## Как пополнять этот файл

- Новая библиотека, ассет или копия чужой документации — строка в подходящей таблице в той же задаче (догма 1).
- Лицензию брать из самого пакета (`license` в `package.json`, текст в файле лицензии), а не из памяти и не из README.
- После обновления зависимостей прогнать `pnpm licenses ls --recursive` и сверить счёт с таблицей транзитивных лицензий: если появилась новая лицензия, её надо разобрать и записать, а не оставить.
