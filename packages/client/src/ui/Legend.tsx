import type { GameState } from "@homamru/core";
import { Dialog, DialogButton } from "./Dialog.tsx";

interface LegendProps {
  readonly state: GameState;
  readonly onClose: () => void;
}

/** Строки окна: класс значка (вид — в styles.css, цвета те же, что у заглушек карты) и слова. */
const ROWS = [
  ["legend-hero", "А", "Ваш герой"],
  ["legend-guard", "О", "Охранник; буква — первая буква существа. Сколько их — в подписи"],
  ["legend-mine legend-wood", "", "Лесопилка: дерево каждый день"],
  ["legend-mine legend-ore", "", "Рудник: руда каждый день"],
  ["legend-mine legend-gold", "", "Золотая шахта: золото каждый день"],
  ["legend-flag", "", "Флажок на шахте: шахта занята, цвет — владелец"],
  [
    "legend-pile legend-gold",
    "",
    "Кучка ресурса: жёлтая — золото, коричневая — дерево, серая — руда",
  ],
  ["legend-obstacle", "", "Препятствие: пройти нельзя"],
  ["legend-dot legend-today", "", "Путь: сюда герой дойдёт сегодня"],
  ["legend-dot legend-later", "", "Путь: сюда — в следующие дни"],
  ["legend-ring", "", "Здесь герой остановится сегодня"],
  ["legend-cross", "✕", "Сюда дойти нельзя"],
  ["legend-zone", "", "Зона охранника: остановка здесь — бой"],
] as const;

/**
 * Условные обозначения карты. Окно временное: пока на карте заглушки (догма 14),
 * по виду значка не понять, что это.
 */
export function Legend({ state, onClose }: LegendProps) {
  const letters = state.creatures
    .map((creature) => `${creature.name.slice(0, 1).toUpperCase()} — ${creature.name}`)
    .join(", ");
  return (
    <Dialog title="Обозначения">
      <div className="legend">
        {ROWS.map(([icon, letter, text]) => (
          <div key={text} className="legend-row">
            <span className="legend-cell">
              <span className={`legend-icon ${icon}`}>{letter}</span>
            </span>
            <span>{text}</span>
          </div>
        ))}
      </div>
      <div className="dialog-text">Буквы охранников: {letters}.</div>
      <div className="dialog-text">
        Первое касание показывает путь, второе — отправляет героя. Удержание пальца на объекте —
        подпись.
      </div>
      <DialogButton label="Закрыть" onClick={onClose} />
    </Dialog>
  );
}
