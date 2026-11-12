import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installErrorScreen, showErrorScreen } from "./diagnostics/errorScreen.ts";
import { pickStorage } from "./save/saveStorage.ts";
import "./styles.css";
import { App } from "./ui/App.tsx";

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`На странице нет элемента #${id}`);
  }
  return element;
}

installErrorScreen();

// Ошибку при отрисовке интерфейса React сюда и приносит: показываем тот же экран.
createRoot(requireElement("ui"), { onUncaughtError: showErrorScreen }).render(
  <StrictMode>
    <App gameParent={requireElement("game")} storage={pickStorage()} />
  </StrictMode>,
);
