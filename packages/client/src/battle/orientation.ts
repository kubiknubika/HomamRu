/**
 * Ориентация экрана на время боя (docs/mechanics/16-battle-screen.md, «Ориентация»).
 * На телефоне экран поворачивается сам; в браузере ничего не делается —
 * там при книжном окне показана просьба повернуть устройство.
 */
import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";

/** Умеет ли приложение само повернуть экран. */
export function canRotateScreen(): boolean {
  return Capacitor.isNativePlatform();
}

/** Поворачивает экран в альбомную ориентацию. Возвращает, получилось ли. */
export async function lockLandscape(): Promise<boolean> {
  if (!canRotateScreen()) {
    return false;
  }
  try {
    await ScreenOrientation.lock({ orientation: "landscape" });
    return true;
  } catch {
    return false;
  }
}

/** Возвращает экрану свободный поворот, как было до боя. */
export async function unlockOrientation(): Promise<void> {
  if (!canRotateScreen()) {
    return;
  }
  try {
    await ScreenOrientation.unlock();
  } catch {
    // Вернуть поворот не вышло — игре это не мешает.
  }
}
