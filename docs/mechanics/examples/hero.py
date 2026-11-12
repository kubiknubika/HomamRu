"""Независимый пересчёт примеров для спецификаций этапа 3 (решение 0007).

Запуск: python3 docs/mechanics/examples/hero.py
Печатает строки таблиц для 21-guards.md (рост охранников) и 22-hero.md
(пороги уровней, предел уровня, опыт за бой). Код игры этим скриптом не пользуется.
"""

# ---------- рост охранников (21-guards.md) ----------

GROWTH_PERCENT = 10
GROWTH_CAP = 4000


def grow(power):
    """Одна неделя. Сила хранится в тысячных долях существа, дробь копится."""
    if power // 1000 >= GROWTH_CAP:
        return power
    return power * (100 + GROWTH_PERCENT) // 100


def count_of(power):
    return min(power // 1000, GROWTH_CAP)


print("Рост охранников: было | через 1 | 2 | 3 | 4 недели")
for start in (1, 5, 9, 10, 15, 25, 100, 3990):
    power = start * 1000
    row = [start]
    for _ in range(4):
        power = grow(power)
        row.append(count_of(power))
    print("| " + " | ".join(str(n) for n in row) + " |")

# ---------- уровни героя (22-hero.md) ----------

TABLE = [0, 1000, 2000, 3200, 4600, 6200, 8000, 10000, 12200, 14700,
         17500, 20600, 24320, 28784, 34140]
MAX_SAFE = 2**53 - 1  # наибольшее целое, точное в числах JavaScript


def thresholds(limit):
    """Пороги опыта по уровням, пока порог не больше limit."""
    result = list(TABLE)
    diff = result[-1] - result[-2]
    while True:
        diff += diff // 5
        if result[-1] + diff > limit:
            return result
        result.append(result[-1] + diff)


levels = thresholds(MAX_SAFE)
print()
print("Пороги уровней 1-20:")
for level in range(1, 21):
    print(f"| {level} | {levels[level - 1]} |")
print()
print(f"Наибольший уровень с точным порогом: {len(levels)}, порог {levels[-1]}")

# ---------- опыт за бой (22-hero.md) ----------

HEALTH = {"ополченец": 12, "пращник": 9, "сокол": 18}
print()
print("Опыт за бой:")
for killed in ({"ополченец": 15}, {"пращник": 10}, {"сокол": 8}, {"ополченец": 20, "сокол": 5}):
    total = sum(HEALTH[name] * count for name, count in killed.items())
    print(f"| {killed} | {total} |")
