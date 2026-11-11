# Phaser 4 против Phaser 3: что помнить

Модели обучены в основном на Phaser 3. Проект использует Phaser 4.2.1. Этот файл — краткая выжимка отличий, важных для HomamRu.

Полные тексты (на английском):

- `docs/vendor/phaser/skills/v3-to-v4-migration/SKILL.md` — руководство по переходу;
- `docs/vendor/phaser/skills/v4-new-features/SKILL.md` — новые возможности;
- `docs/vendor/phaser/changelog/` — списки изменений 4.0–4.2.1.

## Главное

Обычный API (спрайты, текст, тайловые карты, сцены, камера, ввод, звук, анимации движения) в версии 4 сохранён. Заново написана отрисовка, и всё, что было с ней связано, изменилось.

## Что сломает код, написанный «по памяти»

| Phaser 3 | Phaser 4 |
|---|---|
| `sprite.setTintFill(цвет)`, свойство `tintFill` | `sprite.setTint(цвет).setTintMode(Phaser.TintModes.FILL)` |
| `preFX`, `postFX` | единая система фильтров: `obj.filters.internal`, `obj.filters.external` |
| `BitmapMask`, `sprite.setMask(mask)` | `sprite.filters.internal.addMask(объект)` |
| эффекты `Bloom`, `Shine`, `Circle` | `Phaser.Actions.AddEffectBloom()`, `AddEffectShine()`, `AddMaskShape()` |
| `sprite.setPipeline('Light2D')` | `sprite.setLighting(true)` |
| свои конвейеры отрисовки (`Pipeline`) | узлы отрисовки (`RenderNode`); конвейеров больше нет |
| `Phaser.Geom.Point` и его функции | `Phaser.Math.Vector2` |
| `Phaser.Math.TAU` равен π/2 | `Phaser.Math.TAU` равен 2π; для π/2 — `Phaser.Math.PI_OVER_2` |
| `Phaser.Math.PI2` | удалён, вместо него `Phaser.Math.TAU` |
| `Phaser.Struct.Set`, `Phaser.Struct.Map` | обычные `Set` и `Map` из JavaScript |
| `roundPixels` по умолчанию `true` | по умолчанию `false`; для отдельного объекта — `vertexRoundMode` |
| `RenderTexture` и `DynamicTexture` рисуют сразу | команды копятся; чтобы выполнить их, нужен вызов `render()` |
| объект `Shader` с отдельными параметрами | объект настроек; время и разрешение сами не подставляются |
| `Mesh`, `Plane`, плагины `Camera3D` и `Layer3D` | удалены |
| `Create.GenerateTexture`, `TextureManager.generate` | удалены |
| сетка `Grid`: свойства `outline…` | свойства `stroke…` |
| `TileSprite` с обрезкой текстуры | обрезка не поддерживается; зато работают кадры из атласа |

Ещё три правила:

- Отрисовка через Canvas считается устаревшей. Проект использует только WebGL.
- Прямые вызовы WebGL (`gl.…`) запрещены: они ломают внутреннее состояние отрисовки.
- Сжатые текстуры нужно сжимать с перевёрнутой осью Y. Обычных PNG и JPG это не касается.

## Что нового полезно для проекта

- **`TilemapGPULayer`** — слой тайловой карты, который рисуется целиком на видеокарте. Подходит для большой карты приключений. Ограничение: только прямоугольная сетка, без изометрии и шестиугольников.
- **`SpriteGPULayer`** — слой для очень большого числа спрайтов.
- **Фильтры на любом объекте и на камере** — подсветка выбранного героя, затемнение под окном, туман войны.
- **Маски через фильтры** — для тумана войны и вырезов.

Шестиугольное поле боя на `TilemapGPULayer` сделать нельзя; для него остаётся обычный `TilemapLayer` или отдельные спрайты.

## Порядок работы агента с Phaser

1. Найди подсистему в `docs/vendor/phaser/skills/` (например, `tilemaps`, `cameras`, `input-keyboard-mouse-touch`) и прочитай её `SKILL.md`.
2. Если пишешь что-то из левого столбца таблицы — остановись, это Phaser 3.
3. Проверь типами: метод, которого нет в `node_modules/phaser/types/phaser.d.ts`, не существует.
4. Весь код с Phaser живёт в пакете `client`. В пакете `core` импорт Phaser запрещён.
