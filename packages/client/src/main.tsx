import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./ui/App.tsx";

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`На странице нет элемента #${id}`);
  }
  return element;
}

createRoot(requireElement("ui")).render(
  <StrictMode>
    <App gameParent={requireElement("game")} />
  </StrictMode>,
);
