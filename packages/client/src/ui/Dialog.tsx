import type { ReactNode } from "react";

interface DialogProps {
  readonly title: string;
  readonly children?: ReactNode;
}

/** Окно посреди экрана. Затемнение под ним не пропускает касания к карте. */
export function Dialog({ title, children }: DialogProps) {
  return (
    <div className="backdrop">
      <div className="dialog">
        <div className="dialog-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

interface DialogButtonProps {
  readonly label: string;
  readonly onClick: () => void;
}

export function DialogButton({ label, onClick }: DialogButtonProps) {
  return (
    <button type="button" className="dialog-button" onClick={onClick}>
      {label}
    </button>
  );
}
