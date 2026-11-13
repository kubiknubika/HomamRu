/** Партии «компьютер против компьютера» из консоли: сводка по многим и одна целиком. */
import { createGame, formatEvent, playComputerGame, renderState } from "@homamru/core";
import type { ComputerGame, GameContent, MapDefinition } from "@homamru/core";
import type { ScenarioRun } from "./scenario.ts";

/** Срок партии двух компьютеров в днях: подобран на шаге 5.2 (docs/mechanics/42-opponent.md). */
export const RIVALS_DAYS = 120;

type Played = { ok: true; game: ComputerGame } | { ok: false; failures: string[] };

function play(
  map: MapDefinition,
  content: GameContent,
  seed: number,
  onLine?: (line: string) => void,
): Played {
  const created = createGame(map, seed, content);
  if (!created.ok) {
    return { ok: false, failures: created.errors.map((e) => `Карта: ${e.field}: ${e.message}`) };
  }
  const game = playComputerGame(created.state, RIVALS_DAYS, (state, events) => {
    for (const event of events) {
      if (event.type !== "battle") {
        onLine?.(`День ${state.day}: ${formatEvent(event)}`);
      }
    }
  });
  return { ok: true, game };
}

function problemsOf(game: ComputerGame): string[] {
  if (game.problems.length > 0) {
    return [...game.problems];
  }
  return game.state.outcome === null ? [`за ${RIVALS_DAYS} дней никто не победил`] : [];
}

/** Проводит партии с сидами от 1 до `count` и печатает сводку. */
export function runComputerGames(
  count: number,
  map: MapDefinition,
  content: GameContent,
): ScenarioRun {
  const wins = map.players.map(() => 0);
  const failures: string[] = [];
  let days = 0;
  let longestGame = 0;
  let shortestGame = Number.POSITIVE_INFINITY;
  let longestTurn = 0;
  for (let seed = 1; seed <= count; seed += 1) {
    const played = play(map, content, seed);
    const problems = played.ok ? problemsOf(played.game) : played.failures;
    if (!played.ok || problems.length > 0) {
      failures.push(`Сид ${seed}: ${problems.join("; ")}.`);
      continue;
    }
    const { state } = played.game;
    const winner = state.winner ?? 0;
    wins[winner] = (wins[winner] ?? 0) + 1;
    days += state.day;
    longestGame = Math.max(longestGame, state.day);
    shortestGame = Math.min(shortestGame, state.day);
    longestTurn = Math.max(longestTurn, played.game.longestTurn);
  }
  const finished = count - failures.length;
  const average = finished === 0 ? 0 : Math.round((days * 10) / finished) / 10;
  const lines = [
    `Партий двух компьютеров на карте «${map.name}»: ${count}, без победителя или с ошибкой: ${failures.length}.`,
    `Побед: ${wins.map((won, index) => `игрок ${index + 1} — ${won}`).join(", ")}.`,
    `Дней в партии: от ${finished === 0 ? 0 : shortestGame} до ${longestGame}, в среднем ${average}. Команд за ход самое большее: ${longestTurn}.`,
  ];
  if (failures.length > 0) {
    lines.push("Повторить партию с ошибкой: pnpm run play --rival <сид>");
  }
  return { ok: failures.length === 0, lines, failures };
}

/** Проводит одну партию и печатает её целиком: события по дням и карту в конце. */
export function showComputerGame(
  seed: number,
  map: MapDefinition,
  content: GameContent,
): ScenarioRun {
  const lines = [`Партия двух компьютеров на карте «${map.name}», сид ${seed}.`, ""];
  const played = play(map, content, seed, (line) => lines.push(line));
  if (!played.ok) {
    return { ok: false, lines, failures: played.failures };
  }
  const failures = problemsOf(played.game);
  lines.push("", renderState(played.game.state));
  return { ok: failures.length === 0, lines, failures };
}
