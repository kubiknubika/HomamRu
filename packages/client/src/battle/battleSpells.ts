/**
 * Заклинания на экране боя: что написано в книге, на кого ложится заклинание, что оно сделает.
 * Только тексты и выбор; правила — в ядре. Спецификация: docs/mechanics/64-magic-screen.md.
 */
import {
  applyBattleCommand,
  canTarget,
  masteryOf,
  sorceryPercent,
  spellAtMastery,
  spellValue,
} from "@homamru/core";
import type {
  BattleEvent,
  BattleState,
  HeroState,
  SpellDefinition,
  StackState,
} from "@homamru/core";

type Side = 0 | 1;
/** Колдующий: сила магии и «Волшебство» (проценты к урону). */
type Caster = { readonly spellPower: number; readonly sorcery: number };
type CastOutcome = Extract<BattleEvent, { type: "spellCast" }>["outcome"];

/** «1 раунд», «2 раунда», «5 раундов». */
export function roundsText(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) {
    return `${count} раунд`;
  }
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)
    ? `${count} раунда`
    : `${count} раундов`;
}

const LASTING: Partial<Record<SpellDefinition["effect"], (value: number) => string>> = {
  maxDamage: (value) => (value > 0 ? `наибольший урон +${value}` : "наибольший урон"),
  minDamage: (value) => (value > 0 ? `наименьший урон −${value}` : "наименьший урон"),
  meleeAttack: (value) => `атака в ближнем бою +${value}`,
  defense: (value) => `защита +${value}`,
  meleeDamagePercent: (value) => `урон в ближнем бою × ${value} %`,
  speed: (value) => `скорость +${value}`,
  speedPercent: (value) => `скорость × ${value} %`,
  spellDamagePercent: (value) => `урон от заклинаний этой школы × ${value} %`,
  shotAttack: (value) => `атака при стрельбе +${value}`,
  attackDown: (value) => `атака −${value}`,
  defenseDown: (value) => `защита −${value}`,
  shotDamagePercent: (value) => `урон от стрельбы × ${value} %`,
  prayer: (value) => `атака, защита и скорость +${value}`,
  luck: (value) => `удача +${value}`,
  luckDown: (value) => `удача −${value}`,
  morale: (value) => `боевой дух +${value}`,
  moraleDown: (value) => `боевой дух −${value}`,
};

/** Куда бьёт заклинание по площади (68-spells-area.md). */
const AREA_TEXT: Record<NonNullable<SpellDefinition["area"]>, (chain: number) => string> = {
  ball: () => "клетка и соседние",
  ring: () => "соседние клетки",
  inferno: () => "клетки в двух шагах",
  all: () => "все отряды на поле",
  chain: (chain) => `цепь до ${chain} отрядов, каждому следующему вдвое меньше`,
};

/** Что сделает заклинание на одном отряде: «урон 30», «наибольший урон, 2 раунда». */
function spellEffectText(spell: SpellDefinition, hero: Caster): string {
  if (spell.effect === "damage") {
    const where =
      spell.area === undefined
        ? ""
        : `, ${AREA_TEXT[spell.area](spell.chainLength ?? spell.chain?.[0] ?? 1)}`;
    return `урон ${spellValue(spell, hero)}${where}`;
  }
  if (spell.effect === "heal") {
    return `лечит ${spellValue(spell, hero)} здоровья, снимает вредные заклинания`;
  }
  if (spell.effect === "dispel") {
    return "снимает все заклинания";
  }
  const what = LASTING[spell.effect]?.(spell.value) ?? spell.effect;
  // Срок действия — сила магии, но не меньше раунда (62-battle-spells.md).
  const term =
    spell.cumulative === true ? "до конца боя" : roundsText(Math.max(1, hero.spellPower));
  return `${what}, ${term}`;
}

const MASS_TEXT = {
  ally: "на все ваши отряды",
  enemy: "на все отряды врага",
  any: "на все отряды",
};

/** На кого ложится заклинание, если не на один отряд своей обычной стороны; иначе пусто. */
function reachText(spell: SpellDefinition): string {
  if (spell.mass === true) {
    return `, ${MASS_TEXT[spell.target]}`;
  }
  return spell.target === "any" ? ", на любой отряд" : "";
}

/**
 * Строка книги: «Волшебная стрела — 5 маны — урон 30». Заклинание — уже с навыками героя
 * (`spellAtMastery`): в бою оно такое и есть, на карте его готовит `heroSpellLine`.
 */
export function spellLine(spell: SpellDefinition, hero: Caster): string {
  return `${spell.name} — ${spell.cost} маны — ${spellEffectText(spell, hero)}${reachText(spell)}`;
}

/** Строка заклинания для героя на карте: цена и действие — с его навыками (65-hero-skills.md). */
export function heroSpellLine(
  spell: SpellDefinition,
  hero: Pick<HeroState, "spellPower" | "skills">,
): string {
  return spellLine(spellAtMastery(spell, masteryOf(hero, spell)), {
    spellPower: hero.spellPower,
    sorcery: sorceryPercent(hero),
  });
}

/** Книга по кругам, от первого: внутри круга — в порядке книги. */
export function bookCircles(
  spells: readonly SpellDefinition[],
): { readonly level: number; readonly spells: SpellDefinition[] }[] {
  const levels = [...new Set(spells.map((spell) => spell.level))].toSorted((a, b) => a - b);
  return levels.map((level) => ({
    level,
    spells: spells.filter((spell) => spell.level === level),
  }));
}

export interface BookButton {
  /** Мана героя — число на кнопке. */
  readonly mana: number;
  /** Почему книгу сейчас не открыть; `null` — можно. */
  readonly reason: string | null;
}

/** Кнопка «Книга»; `null` — кнопки нет: у игрока нет героя или у героя нет заклинаний. */
export function bookButton(state: BattleState, side: Side, myTurn: boolean): BookButton | null {
  const hero = state.sides[side].hero;
  if (hero === null || hero.spells.length === 0) {
    return null;
  }
  const { mana } = hero;
  if (!myTurn) {
    return { mana, reason: "не ваш ход" };
  }
  if (state.sides[side].cast) {
    return { mana, reason: "в этом раунде герой уже колдовал" };
  }
  if (hero.spells.every((spell) => spell.cost > mana)) {
    return { mana, reason: "не хватает маны" };
  }
  return { mana, reason: null };
}

/** Отряды, на которые заклинание игрока может лечь. */
export function spellTargets(state: BattleState, side: Side, spell: SpellDefinition): StackState[] {
  return state.stacks.filter((stack) => stack.count > 0 && canTarget(spell, side, stack));
}

function outcomeText(outcome: CastOutcome, spell: SpellDefinition, hero: Caster): string {
  switch (outcome.kind) {
    case "damage":
      return `урон ${outcome.damage}, погибнет ${outcome.killed}`;
    case "heal":
      return `вылечит ${outcome.healed}`;
    case "dispel":
      return "заклинания будут сняты";
    default:
      return spellEffectText(spell, hero);
  }
}

/** Что будет от заклинания «на всех»: «Лечение — на все ваши отряды (3): вылечит 25». */
function massText(spell: SpellDefinition, outcomes: readonly CastOutcome[], hero: Caster): string {
  const healed = outcomes.reduce(
    (total, outcome) => total + (outcome.kind === "heal" ? outcome.healed : 0),
    0,
  );
  const first = outcomes[0];
  const what =
    first === undefined || first.kind === "heal"
      ? `вылечит ${healed}`
      : outcomeText(first, spell, hero);
  return `${spell.name} — ${MASS_TEXT[spell.target]} (${outcomes.length}): ${what}`;
}

/**
 * Что будет, если наколдовать заклинание на отряд: «Ополченец (враг): урон 30, погибнет 2».
 * У заклинания «на всех» — одна строка на всех, какой бы отряд ни выбрали.
 * `null` — ядро такую команду не примет.
 */
function castPreview(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  target: StackState,
): string | null {
  const result = applyBattleCommand(state, {
    type: "battleCast",
    side,
    spell: spell.id,
    target: target.id,
  });
  const casts = result.ok ? result.events.filter((event) => event.type === "spellCast") : [];
  const hero = state.sides[side].hero;
  const [cast] = casts;
  if (cast === undefined || hero === null) {
    return null;
  }
  if (spell.mass === true) {
    return massText(
      spell,
      casts.map((event) => event.outcome),
      hero,
    );
  }
  const whose = target.side === side ? "ваш" : "враг";
  return `${target.creature.name} (${whose}): ${outcomeText(cast.outcome, spell, hero)}`;
}

/** То же, что `castPreview`, но `null` и для отряда, на который заклинание не ложится. */
export function targetPreview(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
  target: StackState,
): string | null {
  return spellTargets(state, side, spell).includes(target)
    ? castPreview(state, side, spell, target)
    : null;
}

/**
 * Что выбрано сразу после выбора заклинания в книге. Заклинание «на всех» цели не требует:
 * выбраны все его цели, касание любой — колдует. У остальных цель ещё не выбрана.
 */
export function massChoice(
  state: BattleState,
  side: Side,
  spell: SpellDefinition,
): { targetId: string | null; preview: string | null } {
  const first = spell.mass === true ? spellTargets(state, side, spell)[0] : undefined;
  const preview = first === undefined ? null : castPreview(state, side, spell, first);
  return { targetId: preview === null ? null : (first?.id ?? null), preview };
}

/**
 * Заклинания на отряде одной строкой: «Благословение (2), Замедление (1)»; пусто — `null`.
 * У действия до конца боя вместо раундов — «∞» и число наложений: «Разрушающий луч (∞ ×2)».
 */
export function effectsText(stack: StackState): string | null {
  return stack.effects.length === 0
    ? null
    : stack.effects
        .map((effect) => {
          const many = (effect.stacks ?? 1) > 1 ? ` ×${effect.stacks}` : "";
          return `${effect.name} (${effect.stacks === undefined ? effect.rounds : `∞${many}`})`;
        })
        .join(", ");
}
