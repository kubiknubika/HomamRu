/**
 * Экран «Что-то пошло не так». Сделан без React: он должен работать и тогда,
 * когда упал сам интерфейс.
 * Спецификация: docs/mechanics/05-diagnostics.md, раздел «Дамп ошибки».
 */
import { saveDump, toDumpError } from "./dump.ts";

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "dialog-button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

/** Показывает экран ошибки; повторные ошибки, пока он открыт, не показываются. */
export function showErrorScreen(reason: unknown): void {
  if (document.querySelector(".error-screen") !== null) {
    return;
  }
  const error = toDumpError(reason);
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop error-screen";
  const dialog = document.createElement("div");
  dialog.className = "dialog";
  const title = document.createElement("div");
  title.className = "dialog-title";
  title.textContent = "Что-то пошло не так";
  const text = document.createElement("div");
  text.className = "dialog-text";
  text.textContent = "Сохраните дамп и отправьте его разработчику: по нему ошибку можно повторить.";
  const details = document.createElement("div");
  details.className = "dialog-details";
  details.textContent = error.message;
  const status = document.createElement("div");
  status.className = "dialog-text";
  dialog.append(
    title,
    text,
    details,
    button("Сохранить дамп", () => {
      void saveDump(error).then((failure) => {
        status.textContent = failure === null ? "" : `Не удалось сохранить дамп: ${failure}`;
      });
    }),
    button("Закрыть", () => {
      backdrop.remove();
    }),
    status,
  );
  backdrop.append(dialog);
  document.body.append(backdrop);
}

/** Ловит ошибки, которые никто не обработал. */
export function installErrorScreen(): void {
  window.addEventListener("error", (event) => {
    showErrorScreen(event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    showErrorScreen(event.reason);
  });
}
