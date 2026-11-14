/**
 * Заклинания: файл заклинаний и чтение магии из сохранения.
 * Спецификации: docs/mechanics/60-spells.md, 61-magic.md; чтение — 04-save.md.
 */
import { MAX_SKILLS, maxMana, SKILL_IDS, SPELL_EFFECTS, SPELL_SCHOOLS } from "@homamru/core";
import type { HeroSkill, HeroState, SkillId, SpellDefinition } from "@homamru/core";
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
  skilledCost: z.int().min(0),
  power: z.int().min(0).default(0),
  value: z.int().min(0).default(0),
  chance: z.int().min(0),
  effect: z.enum(SPELL_EFFECTS),
  target: z.enum(["enemy", "ally", "any"]),
  values: z.tuple([z.int().min(0), z.int().min(0), z.int().min(0)]),
  expertMass: z.boolean().default(false),
  advancedAnyTarget: z.boolean().default(false),
  mass: z.boolean().optional(),
  protects: z.enum(SPELL_SCHOOLS).optional(),
  cumulative: z.boolean().optional(),
  spareMachines: z.boolean().optional(),
  counters: z.array(z.string()).default([]),
}) satisfies z.ZodType<SpellDefinition>;

/**
 * Заклинание в записи боя. В записях до навыков (версия 9) чисел с навыком нет:
 * тогда цена и число на всех уровнях — как без навыка.
 */
export const savedSpellSchema = z.preprocess((raw) => {
  if (typeof raw !== "object" || raw === null) {
    return raw;
  }
  const { cost, value = 0 } = raw as { cost?: unknown; value?: unknown };
  return { skilledCost: cost, values: [value, value, value], ...raw };
}, spellSchema);

/** Герой в записи боя. В записях до этапа 7 магии в бою нет, до шага 7.3 — нет «Волшебства». */
export const battleHeroSchema = z.strictObject({
  attack: z.int(),
  defense: z.int(),
  spellPower: z.int().min(0).default(0),
  mana: z.int().min(0).default(0),
  sorcery: z.int().min(0).default(0),
  spells: z.array(savedSpellSchema).default([]),
});

/** Команда выбора навыка в записи (65-hero-skills.md). */
export const chooseSkillSchema = z.strictObject({
  type: z.literal("chooseSkill"),
  player: z.int(),
  heroId: z.string(),
  skill: z.enum(SKILL_IDS),
});

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
    if (spell.skilledCost > spell.cost) {
      found.push({
        file,
        field: `${index}.skilledCost`,
        message: "Цена с навыком больше цены без навыка.",
      });
    }
    if (spell.values[0] !== spell.value) {
      found.push({
        file,
        field: `${index}.values`,
        message: "Число на базовом уровне навыка должно совпадать с числом без навыка.",
      });
    }
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

type HeroMagic = Pick<
  HeroState,
  "spellPower" | "knowledge" | "mana" | "book" | "spells" | "skills" | "skillOffer" | "skillsOwed"
>;

const skillSchema = z.object({
  id: z.enum(SKILL_IDS),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

/** Навыки героя из записи: только знакомые, без повторов, не больше восьми; нет — пусто. */
export function readSkills(raw: unknown): HeroSkill[] {
  const items = Array.isArray(raw) ? (raw as unknown[]) : [];
  const skills: HeroSkill[] = [];
  for (const item of items) {
    const parsed = skillSchema.safeParse(item);
    if (parsed.success && !skills.some((skill) => skill.id === parsed.data.id)) {
      skills.push(parsed.data);
    }
  }
  return skills.slice(0, MAX_SKILLS);
}

/** Предложение навыков из записи: знакомые навыки без повторов; нет — пусто. */
function readSkillOffer(raw: unknown): SkillId[] {
  const items = Array.isArray(raw) ? (raw as unknown[]) : [];
  const known = items.filter((item): item is SkillId => SKILL_IDS.some((id) => id === item));
  return [...new Set(known)];
}

/** Магия героя из записи: маны не больше запаса; без книги заклинаний нет. */
export function readHeroMagic(
  hero: {
    readonly spellPower: number;
    readonly knowledge: number;
    readonly mana?: number | undefined;
    readonly book: boolean;
    readonly spells?: unknown;
    readonly skills?: unknown;
    readonly skillOffer?: unknown;
    readonly skillsOwed?: unknown;
  },
  spells: readonly SpellDefinition[],
): HeroMagic {
  const skills = readSkills(hero.skills);
  const limit = maxMana({ knowledge: hero.knowledge, skills });
  const owed = z.int().min(0).safeParse(hero.skillsOwed);
  return {
    skills,
    skillOffer: readSkillOffer(hero.skillOffer),
    skillsOwed: owed.success ? owed.data : 0,
    spellPower: hero.spellPower,
    knowledge: hero.knowledge,
    mana: Math.min(hero.mana ?? limit, limit),
    book: hero.book,
    spells: hero.book ? (readSpellIds(hero.spells, spells) ?? []) : [],
  };
}
