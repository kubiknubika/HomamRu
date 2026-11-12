/**
 * Чтение героев с именами и таверны из сохранения — терпимо, как и всё состояние.
 * Правила: docs/mechanics/04-save.md, «Сохранения других версий»; 32-hero-hire.md.
 */
import { TAVERN_OFFERS } from "@homamru/core";
import type { ArmyStack, HeroKind, TavernOffer, TavernRules } from "@homamru/core";
import { z } from "zod";
import { heroKindSchema, tavernRulesSchema } from "./battle.ts";
import type { SaveDefaults } from "./defaults.ts";

const stackSchema = z.object({ creature: z.string(), count: z.int().min(1) });
const offerSchema = z.object({ kind: z.string(), army: z.array(z.unknown()) });

/** Герои партии: читаемые из записи, а за ними герои игры, которых в записи нет. */
export function readHeroKinds(raw: unknown, defaults: SaveDefaults): HeroKind[] {
  const items = Array.isArray(raw) ? (raw as unknown[]) : [];
  const saved = items.flatMap((item) => {
    const parsed = heroKindSchema.strip().safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  const known = new Set(saved.map((kind) => kind.id));
  return [...saved, ...defaults.heroes.filter((kind) => !known.has(kind.id))];
}

/** Правила таверны: из записи, если читаются целиком и существа знакомы; иначе правила игры. */
export function readTavernRules(
  raw: unknown,
  known: ReadonlySet<string>,
  defaults: SaveDefaults,
): TavernRules {
  const parsed = tavernRulesSchema.strip().safeParse(raw);
  const fits = parsed.success && parsed.data.army.every((rule) => known.has(rule.creature));
  return fits ? parsed.data : defaults.tavern;
}

/** Кто герой: идентификатор из записи, если он знаком, иначе первый герой списка. */
export function readHeroKind(
  kind: string | undefined,
  name: string | undefined,
  kinds: readonly HeroKind[],
): { kind: string; name: string } {
  const found = kinds.find((candidate) => candidate.id === kind) ?? kinds[0];
  // Имя из записи остаётся, только если записан и знакомый герой.
  const saved = found?.id === kind && name !== undefined && name !== "" ? name : undefined;
  return { kind: found?.id ?? "", name: saved ?? found?.name ?? "" };
}

function readArmy(items: readonly unknown[], known: ReadonlySet<string>): ArmyStack[] {
  const army: ArmyStack[] = [];
  for (const item of items) {
    const stack = stackSchema.safeParse(item);
    const fresh = stack.success && !army.some((other) => other.creature === stack.data.creature);
    if (stack.success && fresh && known.has(stack.data.creature)) {
      army.push(stack.data);
    }
  }
  return army;
}

export interface TavernContext {
  readonly kinds: readonly HeroKind[];
  readonly rules: TavernRules;
  readonly known: ReadonlySet<string>;
  readonly defaults: SaveDefaults;
}

/**
 * Таверна игрока. Без города она пуста. С городом в ней два разных героя, и это не герой
 * игрока: читаемые записи остаются, недостающие места занимают первые свободные герои списка
 * с наименьшей армией из тех отрядов, что есть всегда.
 */
export function readTavern(
  raw: unknown,
  hasTown: boolean,
  own: string | undefined,
  context: TavernContext,
): TavernOffer[] {
  if (!hasTown) {
    return [];
  }
  const { kinds, rules, known, defaults } = context;
  const offers: TavernOffer[] = [];
  const free = (kind: string) => kind !== own && !offers.some((offer) => offer.kind === kind);
  for (const item of Array.isArray(raw) ? (raw as unknown[]) : []) {
    const parsed = offerSchema.safeParse(item);
    const army = parsed.success ? readArmy(parsed.data.army, known) : [];
    const kind = parsed.success ? parsed.data.kind : "";
    if (army.length > 0 && free(kind) && kinds.some((candidate) => candidate.id === kind)) {
      offers.push({ kind, army });
    }
  }
  const sure = rules.army
    .filter((rule) => rule.chance >= 100)
    .map((rule) => ({ creature: rule.creature, count: rule.min }));
  for (const kind of kinds) {
    if (offers.length < TAVERN_OFFERS && free(kind.id)) {
      offers.push({ kind: kind.id, army: sure.length > 0 ? sure : defaults.heroArmy });
    }
  }
  return offers.slice(0, TAVERN_OFFERS);
}
