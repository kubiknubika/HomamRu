/**
 * Заклинания: файл заклинаний и чтение магии из сохранения.
 * Спецификации: docs/mechanics/60-spells.md, 61-magic.md; чтение — 04-save.md.
 */
import { maxMana, SPELL_EFFECTS, SPELL_SCHOOLS } from "@homamru/core";
import type { HeroState, SpellDefinition } from "@homamru/core";
import { z } from "zod";
import { parseContentFile } from "./parse.ts";
import type { ContentResult } from "./parse.ts";

const MAX_LEVEL = 5;

/** Заклинание в файле заклинаний. Описание полей: docs/mechanics/60-spells.md. */
export const spellSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, "Допустимы строчные латинские буквы, цифры и дефис."),
  name: z.string().min(1),
  level: z.int().min(1).max(MAX_LEVEL),
  schools: z.array(z.enum(SPELL_SCHOOLS)).min(1),
  cost: z.int().min(0),
  power: z.int().min(0).default(0),
  value: z.int().min(0).default(0),
  chance: z.int().min(0),
  effect: z.enum(SPELL_EFFECTS),
  target: z.enum(["enemy", "ally"]),
  protects: z.enum(SPELL_SCHOOLS).optional(),
  counters: z.array(z.string()).default([]),
}) satisfies z.ZodType<SpellDefinition>;

/**
 * Разбирает файл заклинаний и проверяет его по смыслу: идентификаторы не повторяются,
 * снимаемые заклинания есть, у защиты от школы названа школа.
 */
export function parseSpellsFile(file: string, text: string): ContentResult<SpellDefinition[]> {
  const parsed = parseContentFile(file, text, z.array(spellSchema).min(1));
  if (!parsed.ok) {
    return parsed;
  }
  const ids = parsed.value.map((spell) => spell.id);
  const errors = parsed.value.flatMap((spell, index) => {
    const found = [];
    if (ids.indexOf(spell.id) !== index) {
      found.push({ file, field: `${index}.id`, message: `Заклинание «${spell.id}» уже есть.` });
    }
    for (const other of spell.counters.filter((id) => !ids.includes(id))) {
      found.push({ file, field: `${index}.counters`, message: `Заклинания «${other}» нет.` });
    }
    if (spell.effect === "spellDamagePercent" && spell.protects === undefined) {
      found.push({
        file,
        field: `${index}.protects`,
        message: "Не названа школа, от которой защита.",
      });
    }
    return found;
  });
  return errors.length > 0 ? { ok: false, errors } : parsed;
}

/** Заклинания партии: читаемые из записи, а за ними заклинания игры, которых в записи нет. */
export function readSpells(raw: unknown, ours: readonly SpellDefinition[]): SpellDefinition[] {
  const items = Array.isArray(raw) ? (raw as unknown[]) : [];
  const saved = items.flatMap((item) => {
    const parsed = spellSchema.strip().safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  const known = new Set(saved.map((spell) => spell.id));
  return [...saved, ...ours.filter((spell) => !known.has(spell.id))];
}

/** Список заклинаний из записи: только знакомые, без повторов; не список — `null`. */
export function readSpellIds(raw: unknown, spells: readonly SpellDefinition[]): string[] | null {
  const parsed = z.array(z.unknown()).safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const ids = parsed.data.filter(
    (id): id is string => typeof id === "string" && spells.some((spell) => spell.id === id),
  );
  return [...new Set(ids)];
}

/**
 * Набор гильдии города, у которого в записи его нет: в каждом круге — заклинания
 * с наибольшим весом, сколько даёт гильдия. Жребия нет: чтение записи не бросает случайных чисел.
 */
export function defaultGuild(spells: readonly SpellDefinition[]): string[] {
  const chosen: string[] = [];
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const pool = spells
      .filter((spell) => spell.level === level && spell.chance > 0)
      .toSorted((a, b) => b.chance - a.chance);
    chosen.push(...pool.slice(0, MAX_LEVEL + 1 - level).map((spell) => spell.id));
  }
  return chosen;
}

type HeroMagic = Pick<HeroState, "spellPower" | "knowledge" | "mana" | "book" | "spells">;

/** Магия героя из записи: маны не больше запаса; без книги заклинаний нет. */
export function readHeroMagic(
  hero: {
    readonly spellPower: number;
    readonly knowledge: number;
    readonly mana?: number | undefined;
    readonly book: boolean;
    readonly spells?: unknown;
  },
  spells: readonly SpellDefinition[],
): HeroMagic {
  const limit = maxMana(hero);
  return {
    spellPower: hero.spellPower,
    knowledge: hero.knowledge,
    mana: Math.min(hero.mana ?? limit, limit),
    book: hero.book,
    spells: hero.book ? (readSpellIds(hero.spells, spells) ?? []) : [],
  };
}
