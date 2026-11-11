#!/usr/bin/env python3
"""Независимый пересчёт примеров для спецификаций перемещения и времени.

Это НЕ код игры. Скрипт написан отдельно, на другом языке, чтобы числа в
таблицах спецификаций не зависели от реализации в ядре (решение 0007).

Запуск: python3 docs/mechanics/examples/movement.py
Вывод вставляется в таблицы docs/mechanics/02-hero-movement.md и 03-time.md.
"""
import heapq

STRAIGHT = 100
DIAGONAL = 141
DAILY = 1000

# Порядок направлений из спецификации: С, СВ, В, ЮВ, Ю, ЮЗ, З, СЗ.
DIRS = [
    ("N", 0, -1), ("NE", 1, -1), ("E", 1, 0), ("SE", 1, 1),
    ("S", 0, 1), ("SW", -1, 1), ("W", -1, 0), ("NW", -1, -1),
]


def parse(rows):
    return [list(r) for r in rows]


def find(grid, ch):
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c == ch:
                return (x, y)
    raise ValueError(ch)


def is_open(grid, x, y):
    return 0 <= y < len(grid) and 0 <= x < len(grid[0]) and grid[y][x] != "#"


def step_allowed(grid, x, y, dx, dy):
    nx, ny = x + dx, y + dy
    if not is_open(grid, nx, ny):
        return False
    if dx != 0 and dy != 0:
        # Нельзя протиснуться по диагонали между двумя преградами.
        if not is_open(grid, x + dx, y) and not is_open(grid, x, y + dy):
            return False
    return True


def step_cost(dx, dy):
    return DIAGONAL if dx != 0 and dy != 0 else STRAIGHT


def distances_to(grid, target):
    """Стоимость кратчайшего пути от каждой клетки до цели (обратный поиск)."""
    dist = {target: 0}
    heap = [(0, target)]
    while heap:
        d, (x, y) = heapq.heappop(heap)
        if d > dist[(x, y)]:
            continue
        for _, dx, dy in DIRS:
            # Идём назад: из клетки p в текущую шагом (dx, dy).
            px, py = x - dx, y - dy
            if not is_open(grid, px, py):
                continue
            if not step_allowed(grid, px, py, dx, dy):
                continue
            nd = d + step_cost(dx, dy)
            if nd < dist.get((px, py), 10**9):
                dist[(px, py)] = nd
                heapq.heappush(heap, (nd, (px, py)))
    return dist


def shortest_path(grid, start, target):
    """Самый дешёвый путь; при равной стоимости — первый по порядку направлений."""
    dist = distances_to(grid, target)
    if start not in dist:
        return None
    path, (x, y) = [], start
    while (x, y) != target:
        for name, dx, dy in DIRS:
            if not step_allowed(grid, x, y, dx, dy):
                continue
            n = (x + dx, y + dy)
            if n in dist and dist[n] + step_cost(dx, dy) == dist[(x, y)]:
                path.append(name)
                x, y = n
                break
        else:
            raise AssertionError("путь оборвался")
    return path


def cost_of(path):
    return sum(DIAGONAL if len(d) == 2 else STRAIGHT for d in path)


def days_needed(path, left=DAILY):
    """Сколько дней занимает путь, если начать с запасом left."""
    days = 1
    for d in path:
        c = DIAGONAL if len(d) == 2 else STRAIGHT
        if left < c:
            days += 1
            left = DAILY
        left -= c
    return days, left


def show_budget():
    print("== Запас хода ==")
    cases = [
        ("3 шага прямо", ["E"] * 3),
        ("3 шага по диагонали", ["SE"] * 3),
        ("10 шагов прямо", ["E"] * 10),
        ("7 шагов по диагонали", ["SE"] * 7),
        ("4 прямо и 4 по диагонали", ["E"] * 4 + ["SE"] * 4),
        ("9 прямо", ["E"] * 9),
    ]
    for name, path in cases:
        c = cost_of(path)
        left = DAILY - c
        print(f"{name}: стоимость {c}, остаток {left}, "
              f"ещё шаг прямо: {'да' if left >= STRAIGHT else 'нет'}, "
              f"ещё шаг по диагонали: {'да' if left >= DIAGONAL else 'нет'}")
    print(f"максимум шагов прямо за день: {DAILY // STRAIGHT}")
    print(f"максимум шагов по диагонали за день: {DAILY // DIAGONAL}")


MAPS = {
    "A: открытое поле": [
        ".......",
        ".S.....",
        ".......",
        ".....T.",
        ".......",
    ],
    "B: стена с проходом": [
        "...#...",
        ".S.#.T.",
        "...#...",
        ".......",
    ],
    "C: щель по диагонали закрыта": [
        "S#...",
        "#T...",
        ".....",
    ],
    "D: угол можно срезать": [
        "S#...",
        ".T...",
        ".....",
    ],
    "E: цель отрезана": [
        "S.#..",
        "..#.T",
        "..#..",
    ],
    "F: равные пути": [
        "S..",
        "...",
        "..T",
    ],
    "G: равные пути, прямо и по диагонали": [
        "S...",
        "...T",
    ],
    "H: длинный путь на несколько дней": [
        "S.............",
        "############..",
        "T.............",
    ],
}


def show_paths():
    print("\n== Пути ==")
    for name, rows in MAPS.items():
        grid = parse(rows)
        start, target = find(grid, "S"), find(grid, "T")
        path = shortest_path(grid, start, target)
        if path is None:
            print(f"{name}: пути нет")
            continue
        days, left = days_needed(path)
        print(f"{name}: шагов {len(path)}, стоимость {cost_of(path)}, "
              f"дней {days}, остаток в последний день {left}, путь {' '.join(path)}")


def show_calendar():
    print("\n== Календарь ==")
    for day in [1, 2, 7, 8, 14, 15, 28, 29, 56, 57, 365]:
        month = (day - 1) // 28 + 1
        week = (day - 1) // 7 % 4 + 1
        weekday = (day - 1) % 7 + 1
        print(f"день партии {day}: месяц {month}, неделя {week}, день недели {weekday}")


def show_load_maps():
    """Стоимости путей на картах 144×144 из теста бюджета скорости."""
    print("\n== Нагрузочные карты 144×144 ==")
    size = 144
    field = ["." * size] * size
    snake = []
    for y in range(size):
        if y % 2 == 0:
            snake.append("." * size)
        elif y % 4 == 1:
            snake.append("#" * (size - 1) + ".")
        else:
            snake.append("." + "#" * (size - 1))
    for name, rows in [("открытое поле", field), ("змейка", snake)]:
        path = shortest_path(parse(rows), (0, 0), (size - 1, size - 2))
        print(f"{name}: шагов {len(path)}, стоимость {cost_of(path)}")


if __name__ == "__main__":
    show_budget()
    show_paths()
    show_calendar()
    show_load_maps()
