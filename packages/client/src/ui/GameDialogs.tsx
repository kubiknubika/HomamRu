import { mapLabel } from "../game/maps.ts";
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
  /** Партия проиграна: герой потерян. */
  readonly defeated: boolean;
  /** Номер карты текущей партии. */
  readonly mapIndex: number;
  readonly setOverlay: (overlay: Overlay) => void;
  readonly onNew: (mapIndex: number) => void;
  readonly onTrial: () => void;
  readonly onDump: () => void;
}

/** Окна поверх карты: меню, подтверждение новой игры, сообщение, «Поражение». */
export function GameDialogs(props: GameDialogsProps) {
  const { overlay, defeated, mapIndex, setOverlay, onNew, onTrial, onDump } = props;
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
        <DialogButton label="Проверочный бой" onClick={onTrial} />
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
  if (!defeated) {
    return null;
  }
  // Единственный выход из проигранной партии (docs/mechanics/24-map-screen.md).
  return (
    <Dialog title="Поражение">
      <div className="dialog-text">{TEXT.defeat}</div>
      <DialogButton
        label="Новая игра"
        onClick={() => {
          onNew(mapIndex);
        }}
      />
    </Dialog>
  );
}
