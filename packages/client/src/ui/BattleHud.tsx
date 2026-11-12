import type { BattleSummary } from "../game/captions.ts";
import { activeStackOf, canShoot, findStack, turnQueue } from "@homamru/core";
import type { BattleResult, BattleState } from "@homamru/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { describeStack, lostCount } from "../battle/battleLog.ts";
import { PLAYER_SIDE, playerStack } from "../battle/battleSession.ts";
import type { BattleSelection, BattleSession } from "../battle/battleSession.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";

interface BattleHudProps {
  readonly battle: BattleSession;
  /** Закрывает бой и возвращает на карту. */
  readonly onClose: () => void;
  /**
   * Итог боя внутри партии: опыт и уровни. У такого боя нельзя закрыть экран посреди боя,
   * а после поражения остаётся одна кнопка — «Новая игра». У проверочного боя итога нет.
   */
  readonly summary?: BattleSummary | null | undefined;
  /** Бой идёт внутри партии, а не отдельно от неё. */
  readonly inGame?: boolean | undefined;
}

/** Сколько ближайших отрядов показывает очередь ходов; что не влезло по ширине — обрезается. */
const QUEUE_LENGTH = 14;

function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

/** Следит, не выше ли окно, чем шире: бой идёт только в альбомной ориентации. */
function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(isPortrait);
  useEffect(() => {
    const update = (): void => {
      setPortrait(isPortrait());
    };
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, []);
  return portrait;
}

function hintOf(selection: BattleSelection | null): string | null {
  if (selection === null || selection.kind === "move") {
    return null;
  }
  const { min, max } = selection.damage;
  const damage = min === max ? `${min}` : `от ${min} до ${max}`;
  if (selection.kind === "shoot") {
    return `Выстрел: урон ${damage}. Коснитесь врага ещё раз.`;
  }
  return selection.from === null
    ? `Удар: урон ${damage}. Выберите красную клетку, откуда бить.`
    : `Удар: урон ${damage}. Коснитесь оранжевой клетки или врага ещё раз.`;
}

function reasonOf(result: BattleResult): string {
  const won = result.winner === PLAYER_SIDE;
  if (result.reason === "fled") {
    return won ? "Противник бежал." : "Вы бежали с поля боя.";
  }
  return won ? "Армия противника уничтожена." : "Ваша армия уничтожена.";
}

function Losses({ state, side }: { readonly state: BattleState; readonly side: 0 | 1 }) {
  return (
    <div className="dialog-text">
      <b>{side === PLAYER_SIDE ? "Ваши потери" : "Потери противника"}</b>
      {state.stacks
        .filter((stack) => stack.side === side)
        .map((stack) => (
          <div key={stack.id}>
            {stack.creature.name}: {lostCount(state, stack)} из {stack.initialCount}
          </div>
        ))}
    </div>
  );
}

/** Интерфейс поверх поля боя: очередь ходов, кнопки, журнал, окна. */
function Rewards({ summary }: { readonly summary: BattleSummary }) {
  return (
    <div className="dialog-text">
      <div>Опыт: +{summary.experience}</div>
      {summary.levels.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

export function BattleHud({ battle, onClose, summary, inGame = false }: BattleHudProps) {
  const snapshot = useSyncExternalStore(battle.subscribe, battle.getSnapshot);
  const [confirmFlee, setConfirmFlee] = useState(false);
  const [journal, setJournal] = useState(false);
  const portrait = usePortrait();
  const { state, selection, locked, log, history, inspected } = snapshot;
  const won = state.result?.winner === PLAYER_SIDE;

  if (portrait) {
    return (
      <Dialog title="Поверните устройство">
        <div className="dialog-text">Бой идёт только в альбомной ориентации.</div>
        {!inGame && <DialogButton label="Закрыть бой" onClick={onClose} />}
      </Dialog>
    );
  }

  const me = playerStack(snapshot);
  const active = activeStackOf(state);
  const queue = turnQueue(state).slice(0, QUEUE_LENGTH);
  const inspectedStack = inspected === null ? undefined : findStack(state, inspected);
  // Строка над панелью: рассматриваемый отряд, подсказка к выбору, подсказка стрелку, журнал.
  const shooterHint =
    me !== undefined && canShoot(state, me)
      ? `${me.creature.name} — стрелок, выстрелов ${me.shots}: коснитесь врага в красном кольце.`
      : null;
  const status =
    (inspectedStack === undefined ? null : describeStack(state, inspectedStack)) ??
    hintOf(selection) ??
    shooterHint ??
    log;

  return (
    <>
      <div className="battle-log">{status}</div>
      <div className="battle-bar">
        <div className="battle-round">
          Раунд {state.round}
          {active !== undefined && (
            <div className="battle-turn">
              {active.side === PLAYER_SIDE ? "Ваш ход" : "Ход врага"}
            </div>
          )}
        </div>
        <div className="battle-queue">
          {queue.map((id, index) => {
            const stack = findStack(state, id);
            return stack === undefined ? null : (
              <div
                key={id}
                className={`battle-chip battle-chip-${stack.side}${index === 0 ? " battle-chip-active" : ""}`}
              >
                {stack.creature.name.slice(0, 1)}
                <span>{stack.count}</span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="battle-button"
          onClick={() => {
            setJournal(true);
          }}
        >
          Журнал
        </button>
        <button
          type="button"
          className="battle-button"
          disabled={me === undefined || me.turn !== "ready"}
          onClick={battle.wait}
        >
          Ждать
        </button>
        <button
          type="button"
          className="battle-button"
          disabled={me === undefined}
          onClick={battle.defend}
        >
          Защищаться
        </button>
        <button
          type="button"
          className="battle-button"
          disabled={me === undefined || state.sides[PLAYER_SIDE].hero === null}
          onClick={() => {
            setConfirmFlee(true);
          }}
        >
          Бежать
        </button>
      </div>
      {confirmFlee && (
        <Dialog title="Бежать?">
          <div className="dialog-text">Бой будет проигран, армия потеряна.</div>
          <DialogButton
            label="Бежать"
            onClick={() => {
              setConfirmFlee(false);
              battle.flee();
            }}
          />
          <DialogButton
            label="Остаться"
            onClick={() => {
              setConfirmFlee(false);
            }}
          />
        </Dialog>
      )}
      {journal && (
        <Dialog title="Журнал боя">
          <div className="dialog-text battle-journal">
            {history.length === 0 && "Ходов ещё не было."}
            {history.map((line, index) => (
              // Строки журнала только добавляются в конец и срезаются с начала.
              <div key={`${history.length - index}:${line}`}>{line}</div>
            ))}
          </div>
          <DialogButton
            label="Закрыть"
            onClick={() => {
              setJournal(false);
            }}
          />
        </Dialog>
      )}
      {state.result !== null && !locked && (
        <Dialog title={won ? "Победа" : "Поражение"}>
          <div className="dialog-text">{reasonOf(state.result)}</div>
          <Losses state={state} side={0} />
          <Losses state={state} side={1} />
          {won && summary !== null && summary !== undefined && <Rewards summary={summary} />}
          <DialogButton label={inGame && !won ? "Новая игра" : "Закрыть"} onClick={onClose} />
        </Dialog>
      )}
    </>
  );
}
