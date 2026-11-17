# Phaser 4 против Phaser 3: что помнить

Модели обучены в основном на Phaser 3. Проект использует Phaser 4.2.1. Этот файл — краткая выжимка отличий, важных для HomamRu.

Полные тексты (на английском):

- `docs/vendor/phaser/skills/v3-to-v4-migration/SKILL.md` — руководство по переходу;
- `docs/vendor/phaser/skills/v4-new-features/SKILL.md` — новые возможности;
- `docs/vendor/phaser/changelog/` — списки изменений 4.0–4.2.1.

Таблица ниже сверена с установленными типами `packages/client/node_modules/phaser/types/phaser.d.ts` (4.2.1) и с руководством по переходу 2026-11-17. Где руководство расходится с типами — это отмечено отдельно.

## Главное

Обычный API (спрайты, текст, тайловые карты, сцены, камера, ввод, звук, анимации движения) в версии 4 сохранён. Заново написана отрисовка, и всё, что было с ней связано, изменилось.

## Что сломает код, написанный «по памяти»

| Phaser 3 | Phaser 4 | Чем сверено |
|---|---|---|
| `sprite.setTintFill(цвет)`, свойство `tintFill` | `sprite.setTint(цвет).setTintMode(Phaser.TintModes.FILL)`. Метод `setTintFill()` остался в типах, но помечен «deprecated, ничего не делает» (в справке — «Deprecated method which does nothing»): вернуть прежнее поведение им нельзя. Свойства `tintFill` в типах нет | типы (в `phaser.d.ts` у метода написано «Deprecated method which does nothing»), `skills/v3-to-v4-migration` |
| `preFX`, `postFX` | единая система фильтров: `obj.filters.internal`, `obj.filters.external`. При этом `filters` в типах — **nullable** (`Phaser.Types.GameObjects.FiltersInternalExternal | null`), поэтому `obj.filters?.internal`, `obj.filters!.internal` или проверка на `null` | типы (ошибка `TS18047: 'p.filters' is possibly 'null'` на пробном файле) |
| `BitmapMask`, `sprite.setMask(mask)` | `sprite.filters.internal.addMask(объект)`. `BitmapMask` из библиотеки убран; `setMask` в типах остался, но принимает только `GeometryMask` и, по справке к методу, работает лишь в Canvas-отрисовке. Для WebGL — фильтр маски | типы + `changelog/MIGRATION-GUIDE.md` |
| эффекты `Bloom`, `Shine`, `Circle` | `Phaser.Actions.AddEffectBloom()`, `AddEffectShine()`, `AddMaskShape()`. Кроме этих трёх, других `AddEffect*`/`AddMask*` в типах нет; эффекта «круг» готовой функцией нет — круг задаётся `AddMaskShape` с настройкой формы | типы (перечислены все `function Add*`) |
| `sprite.setPipeline('Light2D')` | `sprite.setLighting(true)` | типы |
| свои конвейеры отрисовки (`Pipeline`) | узлы отрисовки (`RenderNode`); конвейеров больше нет | типы (367 упоминаний `RenderNode`, `setPipeline` отсутствует) |
| `Phaser.Geom.Point` и его функции | `Phaser.Math.Vector2` — класс `Vector2` лежит именно в `namespace Math`, не в `Geom` | типы + `MIGRATION-GUIDE.md` |
| `Phaser.Math.TAU` равен π/2 | `Phaser.Math.TAU` равен 2π; для π/2 — `Phaser.Math.PI_OVER_2` | типы + `CHANGELOG-v4.0.0.md` |
| `Phaser.Math.PI2` | удалён, вместо него `Phaser.Math.TAU` | типы (0 упоминаний) |
| `Phaser.Struct.Set`, `Phaser.Struct.Map` | обычные `Set` и `Map` из JavaScript. Внимание: в типах `Phaser.Structs.Map` всё ещё есть (и `Structs.List`, `Structs.RTree`, `Structs.Size`, `Structs.ProcessQueue`), а `Structs.Set` исчез. Внутри самой библиотеки `Structs.Map` ещё используется — на чужой код это не влияет, но «убрано всё» сказать нельзя | типы + `MIGRATION-GUIDE.md` |
| `roundPixels` по умолчанию `true` | по умолчанию `false`; для отдельного объекта — `vertexRoundMode` (значения `"full"`, `"safe"`, `"fullAuto"`, `"safeAuto"`; по умолчанию `"safeAuto"` — округляет, только если у камеры включён `roundPixels`) | `CHANGELOG-v4.0.0.md` |
| `RenderTexture` и `DynamicTexture` рисуют сразу | команды копятся; чтобы выполнить их, нужен вызов `render()` | типы (`DynamicTexture#render()`) |
| объект `Shader` с отдельными параметрами | объект настроек; время и разрешение сами не подставляются | `MIGRATION-GUIDE.md` |
| `Mesh`, `Plane`, плагины `Camera3D` и `Layer3D` | удалены. Взамен для 2D-сеток есть `Mesh2D` (это не 3D-меш: OBJ-файлы больше не читаются) | `CHANGELOG-v4.0.0.md`, «Removed Mesh Game Object» |
| `Create.GenerateTexture`, `TextureManager.generate` | удалены. Остался `Graphics#generateTexture` — им и рисуются заглушки | типы |
| сетка `Grid`: свойства `outline…` | свойства `stroke…` (например `strokeOutside`, `strokeOutsideIncomplete`), плюс новые настройки промежутков между клетками | типы + `CHANGELOG-v4.0.0.md` |
| `TileSprite` с обрезкой текстуры | обрезка не поддерживается; зато работают кадры из атласа | `CHANGELOG-v4.0.0.md`, «TileSprite Features» |

Ещё три правила:

- Отрисовка через Canvas считается устаревшей. Проект использует только WebGL.
- Прямые вызовы WebGL (`gl.…`) запрещены: они ломают внутреннее состояние отрисовки.
- Сжатые текстуры нужно сжимать с перевёрнутой осью Y. Обычных PNG и JPG это не касается.

## Что нового полезно для проекта

- **`TilemapGPULayer`** — слой тайловой карты, который рисуется целиком на видеокарте. Подходит для большой карты приключений. Создаётся не отдельным классом, а флагом: `tilemap.createLayer(0, tileset, 0, 0, true)` возвращает `TilemapGPULayer`. Ограничения: один набор плиток с одной текстурой; не больше 4096×4096 плиток; только прямоугольная сетка, без изометрии и шестиугольников; после правки плиток нужно звать `generateLayerDataTexture()`, сама она не перерисовывается.
- **`SpriteGPULayer`** — слой для очень большого числа спрайтов.
- **Фильтры на любом объекте и на камере** — подсветка выбранного героя, затемнение под окном, туман войны.
- **Маски через фильтры** — для тумана войны и вырезов.

Шестиугольное поле боя на `TilemapGPULayer` сделать нельзя; для него остаётся обычный `TilemapLayer` или отдельные спрайты.

## Как это выглядит в нашем коде

Сверено по `packages/client/src` на 2026-11-17: подводных камней из таблицы в коде нет.

| Что мы делаем | Как | Замечание |
|---|---|---|
| Запуск игры | `new Phaser.Game({ type: Phaser.WEBGL, scale: { mode: Phaser.Scale.RESIZE } })` | `game/createGame.ts`; WebGL, как требует версия 4 |
| Текстура местности и другие заглушки | `graphics.generateTexture(...)` + `graphics.destroy()` | `Graphics#generateTexture` в версии 4 на месте, `Create.GenerateTexture` нам не нужен |
| Карта | `this.make.tilemap({ data, ... })`, `addTilesetImage`, `createLayer(...)` | обычный `TilemapLayer`; на `TilemapGPULayer` не переходили — повода не было (догма 13: сначала замер) |
| Ходьба героя | `this.tweens.chain({ targets, tweens, onComplete })` | `TweenManager#chain` в 4 принимает объект с `targets` и `tweens` |
| Цвет героя | `scene.add.circle(x, y, r, playerColor(owner))` + `setStrokeStyle` | цвет задаётся при создании фигуры, `setTint`/`setTintFill` в клиенте не используются вовсе |
| Прозрачность | `setAlpha(...)` | не фильтры, ничего не поменялось |
| Сетка на плитках | `lineStyle` + `strokeRect` на `Graphics` | это не `Grid`, переименование `outline → stroke` нас не касается |

Если в клиенте появится `setTint`, маска, эффект или своя сетка `Grid` — сначала эта таблица, потом код.

## Порядок работы агента с Phaser

1. Найди подсистему в `docs/vendor/phaser/skills/` (например, `tilemaps`, `cameras`, `input-keyboard-mouse-touch`) и прочитай её `SKILL.md`.
2. Если пишешь что-то из левого столбца таблицы — остановись, это Phaser 3.
3. Проверь типами: метод, которого нет в `packages/client/node_modules/phaser/types/phaser.d.ts`, не существует. Пакет `phaser` стоит в `packages/client`, поэтому и типы лежат там, а не в корне. Типы — последний судья: в них бывает то, чего в руководстве уже нет (например, `setTintFill` и `Structs.Map`), но вызвать такое всё равно нельзя.
4. Весь код с Phaser живёт в пакете `client`. В пакете `core` импорт Phaser запрещён.
