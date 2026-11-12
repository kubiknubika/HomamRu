import { useEffect, useState } from "react";
import type { Notice } from "../game/session.ts";

/** Сколько секунд сообщение остаётся на экране. */
const MESSAGE_MS = 4000;

/** Сообщение о случившемся: строки на несколько секунд. */
export function Messages({ notice }: { readonly notice: Notice }) {
  const [hiddenId, setHiddenId] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setHiddenId(notice.id);
    }, MESSAGE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice.id]);
  if (hiddenId === notice.id) {
    return null;
  }
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
