# Генератор галереи кастомных предметов

Client-side инструмент для Minecraft Java Edition 1.21.5. Сайт локально анализирует resource pack, находит Item Model Definitions, создаёт варианты ItemStack и собирает готовый ZIP мира с галереей.

Сайт проекта: https://example.com/custom-item-gallery

Ссылка выше временная и будет заменена после публикации сайта.

Интерфейс поддерживает русский и английский языки. Переключатель находится в правой части верхней панели рядом с подписью авторов.

## Возможности

- чтение ZIP resource pack без загрузки на сервер;
- поиск definitions по `assets/<namespace>/items/**/*.json`;
- поддержка любых namespace;
- рекурсивный разбор `model`, `select`, `condition`, `range_dispatch` и `composite`;
- обработка `minecraft:custom_model_data`, `minecraft:custom_name`, `minecraft:trim` и других компонентов;
- исключение базового vanilla fallback из галереи;
- шаблоны с Item Frame и Armor Stand;
- Armor Stand с предметом в `equipment.mainhand`, `equipment.offhand` и `equipment.head`;
- повторение шаблона последовательно на юг по оси `+Z`;
- параллельные линии по категориям предметов;
- генерация настоящего Minecraft-мира с `level.dat`, Anvil region и entity region;
- скачивание списка variants и отчёта properties;
- полностью локальная обработка в браузере.

## Использование

1. Откройте сайт через static hosting или локальный HTTP-сервер.
2. Загрузите ZIP resource pack.
3. Выберите Item Frame или Armor Stand template.
4. Укажите название мира.
5. Нажмите `СОЗДАТЬ ZIP МИРА`.
6. Распакуйте архив в `.minecraft/saves/`.
7. Откройте мир в Minecraft Java Edition 1.21.5 и включите исходный resource pack.

Структуры размещаются начиная примерно с `(0,100,0)` и повторяются на юг. Для каждого нового мира используйте новый экспорт, если изменились template или resource pack.

## Templates

Шаблоны хранятся в отдельных папках:

```text
templates/
├── item_frame/
│   ├── test.nbt
│   └── ksepsp.nbt
└── armor_stand/
    └── test.nbt

templates_preview/
├── item_frame/
│   ├── test.gif
│   └── ksepsp.gif
└── armor_stand/
    └── test.gif
```

Имя карточки формируется из имени `.nbt` файла. Например:

```text
templates/item_frame/ksepsp.nbt
→ Item Frame · Ksepsp
```

Template должен быть Structure NBT из Minecraft Java Edition 1.21.5 с включённым `Include Entities`.

Для Item Frame пустые `minecraft:item_frame` и `minecraft:glow_item_frame` становятся слотами.

Для Armor Stand каждый `minecraft:armor_stand` становится одним слотом. Сгенерированный предмет записывается в:

```text
equipment.mainhand
```

Структура должна корректно повторяться бесконечно в направлении юг/север по оси Z и содержать блоки-опоры для entities.

## Категории

Правила категорий находятся в:

```text
config/item-categories.json
```

В конфиге есть категории Food, Weapons, Tools, Armor, Potions, Blocks, Materials и Fallback. Сначала проверяются точные item IDs, затем wildcard patterns. Все неизвестные предметы попадают в `fallback`.

Каждая категория становится отдельной параллельной линией, направленной на юг. Категории можно расширять без изменения JavaScript-кода.

## Локальная разработка

Сборка не требуется. Для работы ES modules используйте любой static HTTP-сервер, например:

```text
python -m http.server
```

Тестовый resource pack находится в `test_rp/` и игнорируется git. В dev-режиме сайт пытается загрузить его автоматически.

## Pull Request

Pull request с новым template приветствуется.

Для добавления структуры:

1. Положите `.nbt` в `templates/item_frame/` или `templates/armor_stand/`.
2. Положите preview GIF в соответствующую папку `templates_preview/`.
3. Используйте понятное имя файла.
4. Проверьте template в Minecraft 1.21.5.
5. Убедитесь, что структура повторяется без разрушения в направлении юг/север.
6. Убедитесь, что Item Frame или Armor Stand имеют корректные опорные блоки.
7. Для Armor Stand проверьте поля `equipment.mainhand`, `equipment.offhand` и `equipment.head`.
8. В описании PR укажите количество слотов, размер структуры и направление повторения.

Если нужно добавить новую категорию предметов, измените `config/item-categories.json`. Неизвестные предметы должны оставаться покрытыми категорией `fallback`.

## Лицензия

MIT.
