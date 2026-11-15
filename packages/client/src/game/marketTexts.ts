// Рынок на экране города: курс, сколько сделок по карману и слова кнопки (72-market.md).
import { marketCount, marketRate } from "@homamru/core";
import type { GameState, Resource, TownState } from "@homamru/core";
import { RESOURCE_NAMES } from "./captions.ts";

export interface MarketOffer {
  /** «дерево 10 → руда 1». */
  readonly rate: string;
  /** Сколько сделок игрок может оплатить. */
  readonly max: number;
  /** Число сделок, приведённое к границам от 1 до `max` (при `max` 0 — 1). */
  readonly count: number;
  /** «Отдать: дерево 30. Получить: руда 3». */
  readonly deal: string;
  /** Почему обменять нельзя; `null` — можно. */
  readonly reason: string | null;
}

/** Есть ли в городе рынок. */
export function hasMarket(state: GameState, town: TownState): boolean {
  return state.buildings.some(
    (building) => building.market === true && town.buildings.includes(building.id),
  );
}

/** Предложение рынка города для пары ресурсов и желаемого числа сделок. */
export function marketOffer(
  state: GameState,
  town: TownState,
  give: Resource,
  want: Resource,
  wanted: number,
): MarketOffer {
  const rate = marketRate(give, want, marketCount(state, town.owner));
  const have = state.players.find((player) => player.id === town.owner)?.resources[give] ?? 0;
  const max = Math.floor(have / rate.give);
  const count = Math.max(1, Math.min(max, wanted));
  const from = RESOURCE_NAMES[give];
  const to = RESOURCE_NAMES[want];
  return {
    rate: `${from} ${rate.give} → ${to} ${rate.get}`,
    max,
    count,
    deal: `Отдать: ${from} ${rate.give * count}. Получить: ${to} ${rate.get * count}`,
    reason:
      give === want
        ? "Выберите два разных ресурса."
        : max < 1
          ? `Не хватает: ${from} ${have} из ${rate.give}.`
          : null,
  };
}
