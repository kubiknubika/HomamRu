import { useRef } from "react";
import type { MouseEvent } from "react";

/** Сколько держать палец, чтобы нажатие стало удержанием. */
const HOLD_MS = 450;

function preventMenu(event: MouseEvent): void {
  event.preventDefault();
}

/** Кнопка с двумя действиями: короткое нажатие и удержание. */
export function useHold(onTap: () => void, onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const stop = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return {
    onPointerDown: () => {
      stop();
      held.current = false;
      timer.current = setTimeout(() => {
        held.current = true;
        timer.current = null;
        onHold();
      }, HOLD_MS);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // Долгое касание на телефоне открывает меню браузера — здесь оно не нужно.
    onContextMenu: preventMenu,
    onClick: () => {
      if (!held.current) {
        onTap();
      }
      held.current = false;
    },
  };
}
