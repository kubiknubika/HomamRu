import { useEffect, useMemo, useState } from "react";
import { createGame } from "../game/createGame.ts";
import { createFrameMeter } from "../game/frameMeter.ts";
import { MAP_COUNT, mapLabel, startGame } from "../game/maps.ts";
import { createSession } from "../game/session.ts";
import { FrameCounter } from "./FrameCounter.tsx";
import { Hud } from "./Hud.tsx";

interface AppProps {
  /** Элемент страницы, в котором Phaser рисует карту. */
  readonly gameParent: HTMLElement;
}

/** Держит партию и холст Phaser; при смене карты начинает партию заново. */
export function App({ gameParent }: AppProps) {
  const [mapIndex, setMapIndex] = useState(0);
  const session = useMemo(() => createSession(startGame(mapIndex)), [mapIndex]);
  const frameMeter = useMemo(() => createFrameMeter(), []);

  useEffect(() => {
    const game = createGame(gameParent, session, frameMeter);
    return () => {
      game.destroy(true);
    };
  }, [gameParent, session, frameMeter]);

  return (
    <>
      <Hud session={session} />
      <div className="hud-debug">
        <FrameCounter frameMeter={frameMeter} />
        <button
          type="button"
          className="hud hud-map-switch"
          onClick={() => {
            setMapIndex((mapIndex + 1) % MAP_COUNT);
          }}
        >
          Карта: {mapLabel(mapIndex)}
        </button>
      </div>
    </>
  );
}
