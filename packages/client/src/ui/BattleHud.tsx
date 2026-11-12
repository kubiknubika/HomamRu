import { activeStackOf, findStack, turnQueue } from "@homamru/core";
import type { BattleResult, BattleState, StackState } from "@homamru/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { canRotateScreen, lockLandscape, unlockOrientation } from "../battle/orientation.ts";
import { PLAYER_SIDE, playerStack } from "../battle/battleSession.ts";
import type { BattleSelection, BattleSession } from "../battle/battleSession.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";

interface BattleHudProps {
  readonly battle: BattleSession;
  /** Закрывает бой и возвращает на карту. */
  readonly onClose: () => void;
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

/**
 * На телефоне поворачивает экран на время боя и возвращает после него.
 * Сообщает, не вышло ли повернуть: тогда игрока просят повернуть устройство самому.
 */
function useLandscapeLock(): boolean {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let closed = false;
    void lockLandscape().then((locked) => {
      if (!closed && canRotateScreen() && !locked) {
        setFailed(true);
      }
    });
    return () => {
      closed = true;
      void unlockOrientation();
    };
  }, []);
  return failed;
}

function hintOf(selection: BattleSelection | null): string | null {
  if (selection === null || selection.kind === "move") {
    return null;
  }
  const { min, max } = selection.damage;
  const damage = min === max ? `${min}` : `от ${min} до ${max}`;
  return selection.kind === "shoot"
    ? `Выстрел: урон ${damage}. Коснитесь врага ещё раз.`
    : `Удар: урон ${damage}. Коснитесь красной клетки.`;
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
            {stack.creature.name}: {stack.initialCount - stack.count} из {stack.initialCount}
          </div>
        ))}
    </div>
  );
}

/** Прибавка к характеристике в скобках. */
function bonus(value: number): string {
  return value > 0 ? ` (+${value})` : "";
}

function StackInfo({ state, stack }: { readonly state: BattleState; readonly stack: StackState }) {
  const hero = state.sides[stack.side].hero;
  const { creature } = stack;
  return (
    <div className="dialog-text battle-info">
      <div>
        Существ: {stack.count} из {stack.initialCount}
      </div>
      <div>
        Атака: {creature.attack}
        {bonus(hero?.attack ?? 0)}
      </div>
      <div>
        Защита: {creature.defense}
        {bonus((hero?.defense ?? 0) + stack.defendBonus)}
      </div>
      <div>
        Урон: {creature.damageMin}–{creature.damageMax}
      </div>
      <div>
        Здоровье: {stack.firstHealth} из {creature.health}
      </div>
      <div>Скорость: {creature.speed}</div>
      {creature.flying && <div>Летает</div>}
      {creature.shots > 0 && (
        <div>
          Выстрелов: {stack.shots} из {creature.shots}
        </div>
      )}
      {stack.retaliated && <div>Уже отвечал на удар в этом раунде</div>}
    </div>
  );
}

/** Интерфейс поверх поля боя: очередь ходов, кнопки, журнал, окна. */
export function BattleHud({ battle, onClose }: BattleHudProps) {
  const snapshot = useSyncExternalStore(battle.subscribe, battle.getSnapshot);
  const [confirmFlee, setConfirmFlee] = useState(false);
  const portrait = usePortrait();
  const lockFailed = useLandscapeLock();
  const { state, selection, locked, log, inspected } = snapshot;

  if (portrait && canRotateScreen() && !lockFailed) {
    // Телефон поворачивает экран сам; до конца поворота ничего не показываем.
    return null;
  }
  if (portrait) {
    return (
      <Dialog title="Поверните устройство">
        <div className="dialog-text">Бой идёт только в альбомной ориентации.</div>
        <DialogButton label="Закрыть бой" onClick={onClose} />
      </Dialog>
    );
  }

  const me = playerStack(snapshot);
  const active = activeStackOf(state);
  const queue = turnQueue(state).slice(0, QUEUE_LENGTH);
  const inspectedStack = inspected === null ? undefined : findStack(state, inspected);
  const hint = hintOf(selection);

  return (
    <>
      <div className="battle-log">{hint ?? log}</div>
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
      {inspectedStack !== undefined && (
        <Dialog title={inspectedStack.creature.name}>
          <StackInfo state={state} stack={inspectedStack} />
          <DialogButton label="Закрыть" onClick={battle.closeInspect} />
        </Dialog>
      )}
      {state.result !== null && !locked && (
        <Dialog title={state.result.winner === PLAYER_SIDE ? "Победа" : "Поражение"}>
          <div className="dialog-text">{reasonOf(state.result)}</div>
          <Losses state={state} side={0} />
          <Losses state={state} side={1} />
          <DialogButton label="Закрыть" onClick={onClose} />
        </Dialog>
      )}
    </>
  );
}
