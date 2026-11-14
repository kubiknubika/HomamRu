import type { TrialKind } from "../battle/trialBattle.ts";
import { mapLabel } from "../game/maps.ts";
import type { Ending } from "../game/view.ts";
import { Dialog, DialogButton } from "./Dialog.tsx";
import { TEXT } from "./texts.ts";

/** Окно поверх карты. */
export type Overlay =
  | { readonly kind: "none" }
  | { readonly kind: "menu" }
  /** Подтверждение новой игры на карте с данным номером. */
  | { readonly kind: "confirmNew"; readonly mapIndex: number }
  | { readonly kind: "notice"; readonly text: string; readonly offerDump: boolean };

export const NO_OVERLAY: Overlay = { kind: "none" };

interface GameDialogsProps {
  readonly overlay: Overlay;
  /** Чем кончилась партия; `null` — партия идёт. */
  readonly ending: Ending | null;
  /** Номер карты текущей партии. */
  readonly mapIndex: number;
  readonly setOverlay: (overlay: Overlay) => void;
  readonly onNew: (mapIndex: number) => void;
  readonly onTrial: (kind: TrialKind) => void;
  readonly onDump: () => void;
}

/** Окна поверх карты: меню, подтверждение новой игры, сообщение, «Победа» и «Поражение». */
export function GameDialogs(props: GameDialogsProps) {
  const { overlay, ending, mapIndex, setOverlay, onNew, onTrial, onDump } = props;
  function close(): void {
    setOverlay(NO_OVERLAY);
  }
  if (overlay.kind === "menu") {
    return (
      <Dialog title="Меню">
        <DialogButton label="Вернуться в игру" onClick={close} />
        <DialogButton
          label="Новая игра"
          onClick={() => {
            setOverlay({ kind: "confirmNew", mapIndex });
          }}
        />
        <DialogButton
          label="Проверочный бой"
          onClick={() => {
            onTrial("field");
          }}
        />
        <DialogButton
          label="Проверочная осада"
          onClick={() => {
            onTrial("siege");
          }}
        />
        <DialogButton
          label="Сохранить дамп"
          onClick={() => {
            close();
            onDump();
          }}
        />
      </Dialog>
    );
  }
  if (overlay.kind === "confirmNew") {
    return (
      <Dialog title="Новая игра">
        <div className="dialog-text">
          {TEXT.confirm} Карта: {mapLabel(overlay.mapIndex)}.
        </div>
        <DialogButton
          label="Начать заново"
          onClick={() => {
            onNew(overlay.mapIndex);
          }}
        />
        <DialogButton label="Отмена" onClick={close} />
      </Dialog>
    );
  }
  if (overlay.kind === "notice") {
    return (
      <Dialog title="Внимание">
        <div className="dialog-text">{overlay.text}</div>
        {overlay.offerDump && <DialogButton label="Сохранить дамп" onClick={onDump} />}
        <DialogButton label="Закрыть" onClick={close} />
      </Dialog>
    );
  }
  if (ending === null) {
    return null;
  }
  // Единственный выход из оконченной партии (43-opponent-screen.md, «Конец партии»).
  const reason = ending.kind === "defeat" && ending.reason === "townless";
  return (
    <Dialog title={ending.kind === "victory" ? "Победа" : "Поражение"}>
      {ending.kind === "victory" ? (
        <>
          <div className="dialog-text">{TEXT.victory}</div>
          <div className="dialog-text">Дней в партии: {ending.days}</div>
        </>
      ) : (
        <div className="dialog-text">{reason ? TEXT.defeatTownless : TEXT.defeatNothing}</div>
      )}
      <DialogButton
        label="Новая игра"
        onClick={() => {
          onNew(mapIndex);
        }}
      />
    </Dialog>
  );
}
