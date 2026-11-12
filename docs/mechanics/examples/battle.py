"""Независимый пересчёт примеров для спецификаций боя (решение 0007).

Запуск: python3 docs/mechanics/examples/battle.py
Печатает строки таблиц для 10-battle-field.md, 11-battle-turns.md,
13-battle-damage.md. Код игры этим скриптом не пользуется.
"""

from fractions import Fraction

WIDTH, HEIGHT = 15, 11

CREATURES = {
    # имя: (атака, защита, урон от, урон до, здоровье, скорость)
    "ополченец": (5, 5, 2, 3, 12, 4),
    "пращник": (5, 3, 1, 4, 9, 5),
    "сокол": (7, 5, 3, 5, 18, 8),
}


# ---------- поле ----------

def to_cube(col, row):
    """Клетка поля -> кубические координаты. Нечётные ряды сдвинуты вправо."""
    x = col - (row - (row & 1)) // 2
    z = row
    return x, -x - z, z


def distance(a, b):
    ax, ay, az = to_cube(*a)
    bx, by, bz = to_cube(*b)
    return max(abs(ax - bx), abs(ay - by), abs(az - bz))


def neighbours(col, row):
    shift = row & 1
    cells = [
        (col - 1, row), (col + 1, row),
        (col - 1 + shift, row - 1), (col + shift, row - 1),
        (col - 1 + shift, row + 1), (col + shift, row + 1),
    ]
    return sorted((c, r) for c, r in cells if 0 <= c < WIDTH and 0 <= r < HEIGHT)


# ---------- урон ----------

def damage(base, attack, defense, lucky=False, halvings=0):
    """Урон по формуле из 13-battle-damage.md, в точных дробях."""
    bonus = Fraction(0)
    reduction = Fraction(0)
    if attack > defense:
        bonus = Fraction(min(attack - defense, 60), 20)
    elif defense > attack:
        reduction = Fraction(min(defense - attack, 28), 40)
    if lucky:
        bonus += 1
    value = Fraction(base) * (1 + bonus) * (1 - reduction) / (2 ** halvings)
    return max(1, int(value))  # int() отбрасывает дробную часть


def base_damage(rolls, count):
    """Базовый урон отряда: до 10 существ — бросок на каждое, иначе 10 бросков."""
    if count <= 10:
        assert len(rolls) == count
        return sum(rolls)
    assert len(rolls) == 10
    return sum(rolls) * count // 10


def apply_damage(count, first_hp, hp, dmg):
    """Возвращает (осталось существ, здоровье первого, убито)."""
    total = (count - 1) * hp + first_hp
    left = max(0, total - dmg)
    if left == 0:
        return 0, 0, count
    new_count = -(-left // hp)  # деление с округлением вверх
    new_first = left - (new_count - 1) * hp
    return new_count, new_first, count - new_count


def defend_bonus(defense):
    return max(1, defense // 5)


def yes(flag):
    return "да" if flag else "нет"


def main():
    print("## Расстояния (10-battle-field.md)")
    for a, b in [((0, 0), (14, 0)), ((0, 0), (0, 10)), ((0, 0), (14, 10)), ((0, 5), (14, 5)),
                 ((3, 4), (4, 5)), ((3, 5), (4, 6)), ((3, 5), (3, 6)), ((2, 3), (7, 8)), ((0, 5), (10, 5)),
                 ((0, 5), (11, 5)), ((0, 0), (9, 10))]:
        print(f"| ({a[0]}, {a[1]}) | ({b[0]}, {b[1]}) | {distance(a, b)} |")

    print("\n## Соседи (10-battle-field.md)")
    for cell in [(3, 4), (3, 5), (0, 0), (14, 10), (0, 5), (14, 5)]:
        text = ", ".join(f"({c}, {r})" for c, r in neighbours(*cell))
        print(f"| ({cell[0]}, {cell[1]}) | {len(neighbours(*cell))} | {text} |")

    print("\n## Базовый урон (13-battle-damage.md)")
    for rolls, count in [([2, 3, 3], 3), ([2] * 10, 10), ([3] * 10, 10), ([2, 3] * 5, 25),
                         ([2, 3] * 5, 17), ([1] * 10, 11), ([4] * 10, 100), ([3, 3, 4, 5, 5, 3, 4, 4, 5, 3], 37)]:
        print(f"| {count} | {' '.join(map(str, rolls))} | {sum(rolls)} | {base_damage(rolls, count)} |")

    print("\n## Урон (13-battle-damage.md)")
    cases = [
        (25, 5, 5, False, 0), (25, 7, 5, False, 0), (25, 5, 7, False, 0), (25, 10, 5, False, 0),
        (25, 5, 3, True, 0), (25, 5, 5, True, 0), (25, 5, 7, True, 0),
        (25, 5, 5, False, 1), (25, 5, 5, False, 2), (25, 7, 5, True, 1),
        (100, 65, 5, False, 0), (100, 80, 5, False, 0), (100, 5, 33, False, 0), (100, 5, 60, False, 0),
        (1, 5, 33, False, 1), (3, 5, 9, False, 1), (7, 6, 5, False, 0), (7, 5, 6, False, 0), (33, 8, 5, False, 1),
    ]
    for base, a, d, lucky, halv in cases:
        print(f"| {base} | {a} | {d} | {yes(lucky)} | {halv} | {damage(base, a, d, lucky, halv)} |")

    print("\n## Потери (13-battle-damage.md)")
    for count, first, hp, dmg in [(10, 12, 12, 11), (10, 12, 12, 12), (10, 12, 12, 13), (10, 5, 12, 5),
                                  (10, 5, 12, 4), (10, 5, 12, 30), (10, 12, 12, 119), (10, 12, 12, 120),
                                  (10, 12, 12, 500), (1, 1, 18, 1), (5, 9, 9, 20), (7, 18, 18, 50)]:
        c, f, k = apply_damage(count, first, hp, dmg)
        print(f"| {count} | {first} | {hp} | {dmg} | {k} | {c} | {f} |")

    print("\n## Защита при команде «защищаться» (11-battle-turns.md)")
    for d in [1, 3, 4, 5, 9, 10, 14, 15, 23]:
        print(f"| {d} | +{defend_bonus(d)} | {d + defend_bonus(d)} |")

    print("\n## Примеры словами (13-battle-damage.md)")
    # 10 ополченцев бьют 10 пращников, броски все по 2 и все по 3.
    a, d = CREATURES["ополченец"], CREATURES["пращник"]
    for roll in (2, 3):
        dmg = damage(base_damage([roll] * 10, 10), a[0], d[1])
        print(f"10 ополченцев (броски по {roll}) бьют 10 пращников: урон {dmg}, итог {apply_damage(10, d[4], d[4], dmg)}")
    # Ответный удар выживших пращников: ближний бой, урон вдвое меньше.
    for survivors, roll in ((7, 1), (7, 4), (6, 1), (6, 4)):
        dmg = damage(base_damage([roll] * survivors, survivors), d[0], a[1], halvings=1)
        print(f"{survivors} пращников отвечают (броски по {roll}): урон {dmg}, итог {apply_damage(10, a[4], a[4], dmg)}")
    # 20 пращников стреляют по 5 соколам: близко и издалека.
    s = CREATURES["сокол"]
    for halv, roll in ((0, 1), (0, 4), (1, 1), (1, 4)):
        dmg = damage(base_damage([roll] * 10, 20), d[0], s[1], halvings=halv)
        print(f"20 пращников стреляют (броски по {roll}, половин {halv}) по 5 соколам: урон {dmg}, итог {apply_damage(5, s[4], s[4], dmg)}")
    # Герой с атакой 3 ведёт соколов на ополченцев врага, у которого герой с защитой 1.
    for roll in (3, 5):
        dmg = damage(base_damage([roll] * 8, 8), s[0] + 3, a[1] + 1)
        print(f"8 соколов (броски по {roll}, герой +3) бьют 20 ополченцев (герой +1): урон {dmg}, итог {apply_damage(20, a[4], a[4], dmg)}")
        dmg = damage(base_damage([roll] * 8, 8), s[0] + 3, a[1] + 1, lucky=True)
        print(f"  то же с удачей: урон {dmg}, итог {apply_damage(20, a[4], a[4], dmg)}")


if __name__ == "__main__":
    main()
