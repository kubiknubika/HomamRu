import { Dialog, DialogButton } from "./Dialog.tsx";
import { TEXT } from "./texts.ts";

interface StartScreenProps {
  /** Сохранение сделано другой версией игры и было дополнено. */
  readonly adapted: boolean;
  /** Игрок выбрал «Новая игра» и ещё не подтвердил. */
  readonly confirming: boolean;
  readonly onContinue: () => void;
  readonly onAskNew: () => void;
  readonly onNew: () => void;
  readonly onCancel: () => void;
}

/** Окно запуска, когда есть сохранение: продолжить или начать заново. */
export function StartScreen(props: StartScreenProps) {
  return props.confirming ? (
    <Dialog title="Новая игра">
      <div className="dialog-text">{TEXT.confirm}</div>
      <DialogButton label="Начать заново" onClick={props.onNew} />
      <DialogButton label="Отмена" onClick={props.onCancel} />
    </Dialog>
  ) : (
    <Dialog title="Герои Ру">
      {props.adapted && <div className="dialog-text">{TEXT.adapted}</div>}
      <DialogButton label="Продолжить" onClick={props.onContinue} />
      <DialogButton label="Новая игра" onClick={props.onAskNew} />
    </Dialog>
  );
}

interface ProblemScreenProps {
  /** Сообщение о неудаче с дампом, если она была. */
  readonly note: string | null;
  readonly onNew: () => void;
  readonly onDump: () => void;
}

/** Окно запуска, когда сохранение повреждено. */
export function ProblemScreen({ note, onNew, onDump }: ProblemScreenProps) {
  return (
    <Dialog title="Герои Ру">
      <div className="dialog-text">{TEXT.corrupt}</div>
      <DialogButton label="Новая игра" onClick={onNew} />
      <DialogButton label="Сохранить дамп" onClick={onDump} />
      {note !== null && <div className="dialog-text">{note}</div>}
    </Dialog>
  );
}
