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
import { endingOf } from "../game/view.ts";
import type { Session } from "../game/session.ts";
import { createSaver } from "../save/saver.ts";
import type { Saver } from "../save/saver.ts";
import type { SaveStorage } from "../save/saveStorage.ts";
import { BattleHud } from "./BattleHud.tsx";
import { FrameCounter } from "./FrameCounter.tsx";
import { GameDialogs, NO_OVERLAY } from "./GameDialogs.tsx";
import type { Overlay } from "./GameDialogs.tsx";
import { Hud } from "./Hud.tsx";
import { ProblemScreen, StartScreen, UnreadableScreen } from "./StartScreens.tsx";
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
  /**
   * Хранилище отказало, и что в нём лежит — неизвестно. Не «повреждено»:
   * молча начинать новую партию нельзя, и нельзя говорить, что сохранения нет.
   */
  | { readonly kind: "unreadable"; readonly raw: readonly [string | null, string | null] }
  | { readonly kind: "playing"; readonly session: Session; readonly mapIndex: number };

const MAP_INDEXES = Array.from({ length: MAP_COUNT }, (_, index) => index);

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
  /**
   * Номер попытки прочитать сохранение. Читается внутри эффекта, поэтому линтер
   * видит, что зависимость настоящая: «Прочитать ещё раз» его увеличивает.
   */
  const [attempt, setAttempt] = useState(0);
  /** Проверочный бой поверх карты; партия на карте при этом не меняется. */
  const [trial, setTrial] = useState<BattleSession | null>(null);
  const frameMeter = useMemo(() => createFrameMeter(), []);

  const notice = useCallback((text: string, offerDump: boolean) => {
    setOverlay({ kind: "notice", text, offerDump });
  }, []);

  // Запуск: читаем обе копии сохранения.
  useEffect(() => {
    let cancelled = false;
    async function load(round: number): Promise<void> {
      // Номер попытки нужен только чтобы эффект сработал заново: «Прочитать ещё раз».
      void round;
      let copies: [string | null, string | null] = [null, null];
      let readable = true;
      try {
        copies = [await storage.read(0), await storage.read(1)];
      } catch {
        // Отказ хранилища — не «сохранения нет»: что там лежит, неизвестно.
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
        if (!readable) {
          // Читать не смогли — начинать новую партию молча нельзя: старая цела.
          setPhase({ kind: "unreadable", raw: copies });
        } else {
          setPhase(beginNew(nextSaver, 0));
        }
      } else {
        dumpSource.rawSaves = copies;
        setPhase({ kind: "problem" });
      }
    }
    void load(attempt);
    return () => {
      cancelled = true;
    };
  }, [storage, notice, attempt]);

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

  if (phase.kind === "unreadable") {
    return (
      <UnreadableScreen
        onNew={() => {
          newGame(0);
        }}
        onDump={exportDump}
        onRetry={() => {
          // Ещё одна попытка прочитать то же хранилище: отказ мог быть случайным.
          setPhase({ kind: "loading" });
          setAttempt((value) => value + 1);
        }}
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
            } else {
              // Если партия на этом кончилась, окно «Победа» или «Поражение» покажет карта.
              phase.session.leaveBattle();
            }
          }}
        />
      </>
    );
  }

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
        <select
          className="hud hud-map-switch"
          aria-label="Карта"
          value={phase.mapIndex}
          onChange={(event) => {
            // Список остаётся на текущей карте, пока игрок не подтвердил новую игру.
            setOverlay({ kind: "confirmNew", mapIndex: Number(event.target.value) });
          }}
        >
          {MAP_INDEXES.map((index) => (
            <option key={index} value={index}>
              Карта: {mapLabel(index)}
            </option>
          ))}
        </select>
      </div>
      <GameDialogs
        overlay={overlay}
        ending={played === null ? null : endingOf(played.state)}
        mapIndex={phase.mapIndex}
        setOverlay={setOverlay}
        onNew={newGame}
        onTrial={(kind) => {
          setOverlay(NO_OVERLAY);
          // Каждый бой — с новым сидом; сам бой от сида зависит полностью.
          const trialBattle = startTrialBattle(Date.now() % 2_000_000_000, kind);
          setTrial(createBattleSession(trialBattle.state, undefined, 0, trialBattle.opening));
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
