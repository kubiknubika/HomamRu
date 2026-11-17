import type { Notice } from "../game/session.ts";

/**
 * Сообщение о случившемся: строки на несколько секунд. Когда оно гаснет, решает партия:
 * экран карты закрывается на время боя и открывается заново, а отгоревшее сообщение второй раз
 * не показывается (`24-map-screen.md`). Поэтому здесь ни таймера, ни проверки срока.
 */
export function Messages({ notice }: { readonly notice: Notice }) {
  return (
    <div className="hud hud-message">
      {notice.lines.map((line, index) => (
        // Строки одного сообщения не переставляются.
        // oxlint-disable-next-line react/no-array-index-key
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}
