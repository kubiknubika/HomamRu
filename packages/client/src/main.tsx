import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createGame } from "./game/createGame.ts";
import "./styles.css";
import { App } from "./ui/App.tsx";

const INITIAL_SEED = 1;

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`На странице нет элемента #${id}`);
  }
  return element;
}

const game = createGame(requireElement("game"), INITIAL_SEED);

createRoot(requireElement("ui")).render(
  <StrictMode>
    <App initialSeed={INITIAL_SEED} onSeedChange={game.setSeed} />
  </StrictMode>,
);
