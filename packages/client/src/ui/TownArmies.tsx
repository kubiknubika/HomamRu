import type { ArmyStack, GameState, TownState } from "@homamru/core";
import { useState } from "react";
import { creatureName } from "../game/captions.ts";
import type { Session } from "../game/session.ts";
import { useHold } from "./useHold.ts";

interface TownArmiesProps {
  readonly session: Session;
  readonly state: GameState;
  readonly town: TownState;
}

type Side = "garrison" | "hero";

/** Отряд, для которого игрок выбирает, сколько существ перенести. */
interface Choice {
  readonly from: Side;
  readonly creature: string;
  readonly count: number;
}

interface StackButtonProps {
  readonly label: string;
  readonly disabled: boolean;
  readonly onMoveAll: () => void;
  readonly onChoose: () => void;
}

/** Кнопка отряда: нажатие переносит его целиком, удержание открывает выбор числа. */
function StackButton({ label, disabled, onMoveAll, onChoose }: StackButtonProps) {
  const hold = useHold(onMoveAll, onChoose);
  return (
    <button type="button" className="town-button town-stack" disabled={disabled} {...hold}>
      {label}
    </button>
  );
}

interface ArmyLineProps {
  readonly state: GameState;
  readonly title: string;
  readonly army: readonly ArmyStack[];
  readonly arrow: string;
  /** Переносить нельзя: героя в городе нет. */
  readonly locked: boolean;
  /** Последний отряд героя не переносится. */
  readonly keepLast: boolean;
  readonly onMove: (stack: ArmyStack) => void;
  readonly onChoose: (stack: ArmyStack) => void;
}

function ArmyLine(props: ArmyLineProps) {
  const { state, title, army, arrow, locked, keepLast, onMove, onChoose } = props;
  return (
    <div className="town-army">
      <b>{title}</b>
      <div className="town-stacks">
        {army.length === 0 && <span className="town-dim">пусто</span>}
        {army.map((stack) => (
          <StackButton
            key={stack.creature}
            label={`${creatureName(state, stack.creature)} ${stack.count} ${arrow}`}
            disabled={locked || (keepLast && army.length === 1)}
            onMoveAll={() => {
              onMove(stack);
            }}
            onChoose={() => {
              onChoose(stack);
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface ChooserProps {
  readonly name: string;
  readonly max: number;
  readonly choice: Choice;
  readonly setChoice: (choice: Choice | null) => void;
  readonly onMove: () => void;
}

/** Выбор числа существ для переноса. */
function Chooser({ name, max, choice, setChoice, onMove }: ChooserProps) {
  const count = Math.min(choice.count, max);
  const step = (delta: number) => () => {
    setChoice({ ...choice, count: Math.min(max, Math.max(1, count + delta)) });
  };
  return (
    <div className="town-chooser">
      <div>
        Перенести {choice.from === "hero" ? "в гарнизон" : "герою"}: {name} — {count} из {max}
      </div>
      <div className="town-controls">
        <button type="button" className="town-button town-step" onClick={step(-10)}>
          −10
        </button>
        <button
          type="button"
          className="town-button town-step"
          aria-label="Меньше"
          onClick={step(-1)}
        >
          −
        </button>
        <button
          type="button"
          className="town-button town-step"
          aria-label="Больше"
          onClick={step(1)}
        >
          +
        </button>
        <button type="button" className="town-button town-step" onClick={step(10)}>
          +10
        </button>
        <button type="button" className="town-button town-go" disabled={max < 1} onClick={onMove}>
          Перенести
        </button>
        <button
          type="button"
          className="town-button"
          onClick={() => {
            setChoice(null);
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

/** Раздел «Армии»: гарнизон и армия героя, который стоит в городе. */
export function TownArmies({ session, state, town }: TownArmiesProps) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const hero = state.heroes.find(
    (candidate) =>
      candidate.owner === town.owner && candidate.x === town.x && candidate.y === town.y,
  );
  const armyOf = (side: Side) => (side === "hero" ? (hero?.army ?? []) : town.garrison);
  const chosen =
    choice === null || hero === undefined
      ? undefined
      : armyOf(choice.from).find((stack) => stack.creature === choice.creature);
  // Герою нельзя остаться без армии: из последнего отряда уходят не все.
  const lastOfHero = choice?.from === "hero" && hero?.army.length === 1;
  const max = chosen === undefined ? 0 : chosen.count - (lastOfHero ? 1 : 0);
  const line = (side: Side) => ({
    state,
    army: armyOf(side),
    locked: hero === undefined,
    onMove: (stack: ArmyStack) => {
      setChoice(null);
      session.transfer(side, stack.creature, stack.count);
    },
    onChoose: (stack: ArmyStack) => {
      setChoice({ from: side, creature: stack.creature, count: 1 });
    },
  });
  return (
    <section className="town-section">
      <h2 className="town-heading">Армии</h2>
      <ArmyLine title="Гарнизон" arrow="→ герою" keepLast={false} {...line("garrison")} />
      {hero === undefined ? (
        <div className="town-dim">Героя в городе нет</div>
      ) : (
        <ArmyLine title="Армия героя" arrow="→ в гарнизон" keepLast {...line("hero")} />
      )}
      {choice !== null && chosen !== undefined && (
        <Chooser
          name={creatureName(state, chosen.creature)}
          max={max}
          choice={choice}
          setChoice={setChoice}
          onMove={() => {
            setChoice(null);
            session.transfer(choice.from, choice.creature, Math.min(choice.count, max));
          }}
        />
      )}
      {hero !== undefined && (
        <div className="town-dim">
          Нажатие переносит отряд целиком, удержание — выбор числа. Последний отряд героя не
          переносится.
        </div>
      )}
    </section>
  );
}
