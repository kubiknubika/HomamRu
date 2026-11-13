"""Независимый пересчёт примеров для 50-siege.md (решение 0007).

Запуск: python3 docs/mechanics/examples/siege.py
Код игры этим скриптом не пользуется.
"""

from fractions import Fraction

# ---------- урон башен ----------


def keep(buildings):
    low = 10 + 2 * buildings
    return low, 2 * low


def tower(buildings):
    low = 6 + 2 * (buildings // 2)
    return low, 2 * low


print("Зданий | главная | малая")
for n in (0, 1, 3, 4, 7):
    print(n, "|", "%d–%d" % keep(n), "|", "%d–%d" % tower(n))

# ---------- ценность выстрела башни ----------


def killed(count, first, health, damage):
    total = (count - 1) * health + first
    left = max(0, total - damage)
    return count - -(-left // health)


def value(count, health, price, low):
    """Отряд цел (у первого существа полное здоровье)."""
    average = Fraction(low + 2 * low, 2)
    kills = Fraction(killed(count, health, health, low) + killed(count, health, health, 2 * low), 2)
    total = count * health
    return min(total, average) * price / health + kills * price


print()
print("Ценность выстрела главной башни при 4 зданиях (урон 18–36):")
for name, count, health, price in (
    ("30 ополченцев", 30, 12, 60),
    ("5 латников", 5, 32, 300),
    ("1 ополченец", 1, 12, 60),
):
    print(name, "|", float(value(count, health, price, 18)))

# ---------- катапульта ----------

DAMAGE = {0: Fraction(10, 100), 1: Fraction(60, 100), 2: Fraction(30, 100)}
print()
print("Катапульта, средний урон выстрела по прочности:", float(sum(k * p for k, p in DAMAGE.items())))


def broken_within(health, shots):
    """Шанс, что участок прочности health разрушен за shots попавших в него выстрелов."""
    states = {health: Fraction(1)}
    for _ in range(shots):
        after = {}
        for left, chance in states.items():
            for damage, p in DAMAGE.items():
                key = max(0, left - damage)
                after[key] = after.get(key, 0) + chance * p
        states = after
    return states.get(0, Fraction(0))


print("Попаданий | участок 2 разрушен | участок 3 разрушен")
for shots in (1, 2, 3, 4):
    print(shots, "|", "%.1f %%" % (100 * broken_within(2, shots)), "|", "%.1f %%" % (100 * broken_within(3, shots)))
