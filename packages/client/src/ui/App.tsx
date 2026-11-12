import { chooseSave, verifySave } from "@homamru/data";
import type { SaveBody } from "@homamru/data";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogButton } from "./Dialog.tsx";
import { FrameCounter } from "./FrameCounter.tsx";
import { Hud } from "./Hud.tsx";
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

/** Окно поверх игры. */
type Overlay =
  | { readonly kind: "none" }
  | { readonly kind: "menu" }
  /** Подтверждение новой игры на карте с данным номером. */
  | { readonly kind: "confirmNew"; readonly mapIndex: number }
  | { readonly kind: "notice"; readonly text: string; readonly offerDump: boolean };

const NO_OVERLAY: Overlay = { kind: "none" };

/** Держит партию, сохранение и холст Phaser. */
export function App({ gameParent, storage }: AppProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [overlay, setOverlay] = useState<Overlay>(NO_OVERLAY);
  const [saver, setSaver] = useState<Saver | null>(null);
  /** Проверочный бой поверх карты; партия на карте при этом не меняется. */
  const [battle, setBattle] = useState<BattleSession | null>(null);
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
    return overlay.kind === "confirmNew" ? (
      <Dialog title="Новая игра">
        <div className="dialog-text">{TEXT.confirm}</div>
        <DialogButton
          label="Начать заново"
          onClick={() => {
            newGame(0);
          }}
        />
        <DialogButton
          label="Отмена"
          onClick={() => {
            setOverlay(NO_OVERLAY);
          }}
        />
      </Dialog>
    ) : (
      <Dialog title="Герои Ру">
        {phase.adapted && <div className="dialog-text">{TEXT.adapted}</div>}
        <DialogButton
          label="Продолжить"
          onClick={() => {
            continueGame(phase.save);
          }}
        />
        <DialogButton
          label="Новая игра"
          onClick={() => {
            setOverlay({ kind: "confirmNew", mapIndex: 0 });
          }}
        />
      </Dialog>
    );
  }

  if (phase.kind === "problem") {
    return (
      <Dialog title="Герои Ру">
        <div className="dialog-text">{TEXT.corrupt}</div>
        <DialogButton
          label="Новая игра"
          onClick={() => {
            newGame(0);
          }}
        />
        <DialogButton label="Сохранить дамп" onClick={exportDump} />
        {overlay.kind === "notice" && <div className="dialog-text">{overlay.text}</div>}
      </Dialog>
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
          onClose={() => {
            setBattle(null);
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
      {overlay.kind === "menu" && (
        <Dialog title="Меню">
          <DialogButton
            label="Вернуться в игру"
            onClick={() => {
              setOverlay(NO_OVERLAY);
            }}
          />
          <DialogButton
            label="Новая игра"
            onClick={() => {
              setOverlay({ kind: "confirmNew", mapIndex: phase.mapIndex });
            }}
          />
          <DialogButton
            label="Проверочный бой"
            onClick={() => {
              setOverlay(NO_OVERLAY);
              // Каждый бой — с новым сидом; сам бой от сида зависит полностью.
              setBattle(createBattleSession(startTrialBattle(Date.now() % 2_000_000_000)));
            }}
          />
          <DialogButton
            label="Сохранить дамп"
            onClick={() => {
              setOverlay(NO_OVERLAY);
              exportDump();
            }}
          />
        </Dialog>
      )}
      {overlay.kind === "confirmNew" && (
        <Dialog title="Новая игра">
          <div className="dialog-text">
            {TEXT.confirm} Карта: {mapLabel(overlay.mapIndex)}.
          </div>
          <DialogButton
            label="Начать заново"
            onClick={() => {
              newGame(overlay.mapIndex);
            }}
          />
          <DialogButton
            label="Отмена"
            onClick={() => {
              setOverlay(NO_OVERLAY);
            }}
          />
        </Dialog>
      )}
      {overlay.kind === "notice" && (
        <Dialog title="Внимание">
          <div className="dialog-text">{overlay.text}</div>
          {overlay.offerDump && <DialogButton label="Сохранить дамп" onClick={exportDump} />}
          <DialogButton
            label="Закрыть"
            onClick={() => {
              setOverlay(NO_OVERLAY);
            }}
          />
        </Dialog>
      )}
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
