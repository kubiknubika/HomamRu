// Выбор навыка при новом уровне: docs/mechanics/65-hero-skills.md.
import { describe, expect, it } from "vitest";
import { applyCommand } from "./commands.ts";
import { gainExperience } from "./hero.ts";
import { computerCommand } from "./opponent.ts";
import { formatEvent, renderState } from "./render.ts";
import { createRng } from "./rng.ts";
import { afterVictory, choose, chosen, END, heroOf, TO_ZONE } from "./skillKit.ts";
import { SKILL_IDS } from "./skills.ts";
import { gameWith, OPEN_FIELD } from "./testkit.ts";
import type { Command, GameState } from "./types.ts";

describe("выбор навыка при новом уровне", () => {
  it("новый уровень: характеристика, затем два предложения; случайные числа берутся из партии", () => {
    const events: Parameters<typeof gainExperience>[3] = [];
    const fresh = heroOf(gameWith(OPEN_FIELD, []));
    const gained = gainExperience(fresh, 1000, createRng(7), events);
    expect(events.map((event) => event.type)).toEqual([
      "experienceGained",
      "levelGained",
      "skillsOffered",
    ]);
    expect(gained.hero.skillOffer).toHaveLength(2);
    expect(gained.hero.skills).toEqual([]);
    expect(events.at(-1)).toEqual({
      type: "skillsOffered",
      heroId: "A",
      skills: gained.hero.skillOffer,
    });
  });

  it("пока навык не выбран, игрок ничего другого сделать не может", () => {
    // 100 ополченцев × 12 = 1200 опыта: второй уровень.
    const state = afterVictory(100);
    expect(heroOf(state).level).toBe(2);
    expect(heroOf(state).skillOffer).toHaveLength(2);
    for (const command of [END, { ...TO_ZONE, path: ["S"] } as Command]) {
      expect(applyCommand(state, command)).toMatchObject({
        ok: false,
        code: "SKILL_CHOICE_PENDING",
      });
    }
    expect(renderState(state)).toContain("Выбирает навык:");
  });

  it("выбор даёт навык базового уровня; после него игра идёт дальше", () => {
    const state = afterVictory(100);
    const [first, second] = heroOf(state).skillOffer;
    if (first === undefined || second === undefined) {
      throw new Error("Предложений нет.");
    }
    const result = choose(state, second);
    expect(result).toMatchObject({
      ok: true,
      events: [{ type: "skillLearned", heroId: "A", skill: second, level: 1 }],
    });
    const after = chosen(state, second);
    expect(heroOf(after)).toMatchObject({
      skills: [{ id: second, level: 1 }],
      skillOffer: [],
      skillsOwed: 0,
    });
    expect(applyCommand(after, END).ok).toBe(true);
    expect(result.ok ? result.events.map(formatEvent).join() : "").toContain("(базовый)");
  });

  it("отказы: навык не предложен, выбирать не из чего, чужой или неизвестный герой", () => {
    const state = afterVictory(100);
    const offer = heroOf(state).skillOffer;
    const other = SKILL_IDS.find((id) => !offer.includes(id)) ?? "wisdom";
    expect(choose(state, other)).toMatchObject({ ok: false, code: "SKILL_NOT_OFFERED" });
    const calm = gameWith(OPEN_FIELD, []);
    expect(choose(calm, "wisdom")).toMatchObject({ ok: false, code: "NO_SKILL_OFFER" });
    expect(
      applyCommand(state, { type: "chooseSkill", player: 0, heroId: "Z", skill: other }),
    ).toMatchObject({ ok: false, code: "UNKNOWN_HERO" });
    expect(
      applyCommand(state, { type: "chooseSkill", player: 7, heroId: "A", skill: other }),
    ).toMatchObject({ ok: false, code: "UNKNOWN_PLAYER" });
  });

  it("несколько уровней за бой — выборы идут подряд, и второй уже знает о первом", () => {
    // 200 ополченцев × 12 = 2400 опыта: уровни 2 и 3.
    const state = afterVictory(200);
    expect(heroOf(state)).toMatchObject({ level: 3, skillsOwed: 1 });
    const [first] = heroOf(state).skillOffer;
    if (first === undefined) {
      throw new Error("Предложений нет.");
    }
    const result = choose(state, first);
    expect(result.ok ? result.events.map((event) => event.type) : []).toEqual([
      "skillLearned",
      "skillsOffered",
    ]);
    const next = heroOf(chosen(state, first));
    expect(next.skillsOwed).toBe(0);
    // Взятый навык можно повысить — он и есть первое предложение.
    expect(next.skillOffer[0]).toBe(first);
    expect(next.skillOffer).toHaveLength(2);
    expect(applyCommand(chosen(state, first), END)).toMatchObject({ code: "SKILL_CHOICE_PENDING" });
    const done = heroOf(chosen(chosen(state, first), first));
    expect(done).toMatchObject({ skills: [{ id: first, level: 2 }], skillOffer: [] });
  });

  it("компьютер берёт первое предложение, и в чужой ход тоже", () => {
    const state = afterVictory(100);
    const [first] = heroOf(state).skillOffer;
    const computer: GameState = {
      ...state,
      players: state.players.map((player) => ({ ...player, kind: "computer" as const })),
    };
    expect(computerCommand(computer)).toEqual({
      type: "chooseSkill",
      player: 0,
      heroId: "A",
      skill: first,
    });
    expect(computerCommand(state)).toBeUndefined();
  });
});
