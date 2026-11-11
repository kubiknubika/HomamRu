import { createGame as createCoreGame } from "@homamru/core";
import { parseMapFile } from "@homamru/data";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import mapText from "../../../data/maps/test-small.yaml?raw";
import { createGame } from "./game/createGame.ts";
import { createSession } from "./game/session.ts";
import "./styles.css";
import { App } from "./ui/App.tsx";

const MAP_FILE = "data/maps/test-small.yaml";
const SEED = 1;

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`На странице нет элемента #${id}`);
  }
  return element;
}

function describeErrors(errors: readonly { field: string; message: string }[]): string {
  return errors.map((error) => `${MAP_FILE}: ${error.field}: ${error.message}`).join("\n");
}

const map = parseMapFile(MAP_FILE, mapText);
if (!map.ok) {
  throw new Error(describeErrors(map.errors));
}
const created = createCoreGame(map.value, SEED);
if (!created.ok) {
  throw new Error(describeErrors(created.errors));
}

const session = createSession(created.state);
createGame(requireElement("game"), session);

createRoot(requireElement("ui")).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
