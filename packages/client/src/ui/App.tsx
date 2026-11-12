import { chooseSave, verifySave } from "@homamru/data";
import type { SaveBody } from "@homamru/data";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { dumpSource, saveDump } from "../diagnostics/dump.ts";
import { GAME_VERSION } from "../diagnostics/version.ts";
import { createBattleSession } from "../battle/battleSession.ts";
import type { BattleSession } from "../battle/battleSession.ts";
import { startTrialBattle } from "../battle/trialBattle.ts";
import { createBattleGame, createGame } from "../game/createGame.ts";
import { loadDefaults } from "../game/content.ts";
import { createFrameMeter } from "../game/frameMeter.ts";
import { MAP_COUNT, mapIndexOf, mapLabel, startGame } from "../game/maps.ts";
import { createSession } from "../game/session.ts";
import type { Session } from "../game/session.ts";
import { createSaver } from "../save/saver.ts";
import type { Saver } from "../save/saver.ts";
import type { SaveStorage } from "../save/saveStorage.ts";
import { BattleHud } from "./BattleHud.tsx";
import { FrameCounter } from "./FrameCounter.tsx";
import { GameDialogs, NO_OVERLAY } from "./GameDialogs.tsx";
import type { Overlay } from "./GameDialogs.tsx";
import { Hud } from "./Hud.tsx";
import { ProblemScreen, StartScreen } from "./StartScreens.tsx";
import { TEXT } from "./texts.ts";

interface AppProps {
  /** Элемент страницы, в котором Phaser рисует карту. */
  readonly gameParent: HTMLElement;
  readonly storage: SaveStorage;
}

/** Что на экране. Спецификация: docs/mechanics/04-save.md, раздел «Что видит игрок». */
type Phase =
  | { readonly kind: "loading" }
  /** Сохранение есть: «Продолжить» или «Новая игра». */
  | { readonly kind: "start"; readonly save: SaveBody; readonly adapted: boolean }
  /** Сохранение не читается. */
  | { readonly kind: "problem" }
  | { readonly kind: "playing"; readonly session: Session; readonly mapIndex: number };

function subscribeToNothing(): () => void {
  return doNothing;
}

function doNothing(): void {
  // Партии нет — подписываться не на что.
}

function noSnapshot(): null {
  return null;
}

/** Держит партию, сохранение и холст Phaser. */
export function App({ gameParent, storage }: AppProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [overlay, setOverlay] = useState<Overlay>(NO_OVERLAY);
  const [saver, setSaver] = useState<Saver | null>(null);
  /** Проверочный бой поверх карты; партия на карте при этом не меняется. */
  const [trial, setTrial] = useState<BattleSession | null>(null);
  const frameMeter = useMemo(() => createFrameMeter(), []);

  const notice = useCallback((text: string, offerDump: boolean) => {
    setOverlay({ kind: "notice", text, offerDump });
  }, []);

  // Запуск: читаем обе копии сохранения.
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      let copies: [string | null, string | null] = [null, null];
      let readable = true;
      try {
        copies = [await storage.read(0), await storage.read(1)];
      } catch {
        readable = false;
      }
      if (cancelled) {
        return;
      }
      const loaded = chooseSave(copies, loadDefaults());
      const start =
        loaded.kind === "ok"
          ? { seq: loaded.record.seq, slot: loaded.slot }
          : { seq: -1, slot: null };
      const nextSaver = createSaver(storage, start, () => {
        notice(TEXT.storage, false);
      });
      setSaver(nextSaver);
      if (loaded.kind === "ok") {
        const { adapted, ...save } = loaded.record;
        setPhase({ kind: "start", save, adapted });
      } else if (loaded.kind === "none") {
        setPhase(beginNew(nextSaver, 0));
        if (!readable) {
          notice(TEXT.storage, false);
        }
      } else {
        dumpSource.rawSaves = copies;
        setPhase({ kind: "problem" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [storage, notice]);

  const session = phase.kind === "playing" ? phase.session : null;
  const played = useSyncExternalStore(
    session?.subscribe ?? subscribeToNothing,
    session?.getSnapshot ?? noSnapshot,
  );
  // На экране один бой: проверочный или бой партии.
  const battle = trial ?? played?.battle ?? null;
  useEffect(() => {
    if (session === null) {
      return undefined;
    }
    const game =
      battle === null
        ? createGame(gameParent, session, frameMeter)
        : createBattleGame(gameParent, battle, frameMeter);
    return () => {
      game.destroy(true);
    };
  }, [gameParent, session, battle, frameMeter]);

  function exportDump(): void {
    void saveDump(null).then((failure) => {
      if (failure !== null) {
        notice(`Не удалось сохранить дамп: ${failure}`, false);
      }
    });
  }

  function newGame(mapIndex: number): void {
    if (saver !== null) {
      setOverlay(NO_OVERLAY);
      setPhase(beginNew(saver, mapIndex));
    }
  }

  function continueGame(save: SaveBody): void {
    if (saver === null) {
      return;
    }
    setPhase(begin(saver, save));
    // Отладочный режим: до первого выпуска проверка повтором идёт всегда.
    if (!verifySave(save)) {
      notice(TEXT.replay, true);
    }
  }

  if (phase.kind === "loading") {
    return null;
  }

  if (phase.kind === "start") {
    return (
      <StartScreen
        adapted={phase.adapted}
        confirming={overlay.kind === "confirmNew"}
        onContinue={() => {
          continueGame(phase.save);
        }}
        onAskNew={() => {
          setOverlay({ kind: "confirmNew", mapIndex: 0 });
        }}
        onNew={() => {
          newGame(0);
        }}
        onCancel={() => {
          setOverlay(NO_OVERLAY);
        }}
      />
    );
  }

  if (phase.kind === "problem") {
    return (
      <ProblemScreen
        note={overlay.kind === "notice" ? overlay.text : null}
        onNew={() => {
          newGame(0);
        }}
        onDump={exportDump}
      />
    );
  }

  if (battle !== null) {
    return (
      <>
        <div className="hud-debug">
          <FrameCounter frameMeter={frameMeter} />
        </div>
        <BattleHud
          battle={battle}
          inGame={trial === null}
          summary={trial === null ? played?.summary : null}
          onClose={() => {
            if (trial !== null) {
              setTrial(null);
            } else if (played?.state.outcome === null) {
              phase.session.leaveBattle();
            } else {
              // Партия проиграна: из окна итога — только новая игра.
              newGame(phase.mapIndex);
            }
          }}
        />
      </>
    );
  }

  const nextMap = (phase.mapIndex + 1) % MAP_COUNT;
  return (
    <>
      <Hud session={phase.session} />
      <button
        type="button"
        className="hud hud-menu"
        onClick={() => {
          setOverlay({ kind: "menu" });
        }}
      >
        Меню
      </button>
      <div className="hud-debug">
        <FrameCounter frameMeter={frameMeter} />
        <button
          type="button"
          className="hud hud-map-switch"
          onClick={() => {
            setOverlay({ kind: "confirmNew", mapIndex: nextMap });
          }}
        >
          Карта: {mapLabel(phase.mapIndex)}
        </button>
      </div>
      <GameDialogs
        overlay={overlay}
        defeated={played?.state.outcome === "defeat"}
        mapIndex={phase.mapIndex}
        setOverlay={setOverlay}
        onNew={newGame}
        onTrial={() => {
          setOverlay(NO_OVERLAY);
          // Каждый бой — с новым сидом; сам бой от сида зависит полностью.
          setTrial(createBattleSession(startTrialBattle(Date.now() % 2_000_000_000)));
        }}
        onDump={exportDump}
      />
    </>
  );
}

/** Продолжает партию из сохранения; каждая принятая команда сразу записывается. */
function begin(saver: Saver, start: SaveBody): Phase {
  let save = start;
  dumpSource.save = save;
  dumpSource.rawSaves = [];
  const session = createSession(start.state, (command, state) => {
    save = { ...save, commands: [...save.commands, command], state };
    dumpSource.save = save;
    saver.save(save);
  });
  return { kind: "playing", session, mapIndex: mapIndexOf(start.state.map.id) };
}

/** Начинает новую партию и сразу записывает её поверх прежней. */
function beginNew(saver: Saver, mapIndex: number): Phase {
  const state = startGame(mapIndex);
  const save: SaveBody = { gameVersion: GAME_VERSION, initial: state, commands: [], state };
  saver.save(save);
  return begin(saver, save);
}
