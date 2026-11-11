/**
 * Счётчик кадров (docs/mechanics/05-diagnostics.md): средняя частота и самый
 * долгий кадр за последние секунды. Без Phaser, чтобы проверять тестами.
 */

/** За какое время считаются показатели. */
const WINDOW_MS = 3000;

interface FrameStats {
  /** Средняя частота кадров за окно. */
  readonly fps: number;
  /** Наименьшая частота: по самому долгому кадру за окно. */
  readonly minFps: number;
  /** Самый долгий кадр за окно, мс. */
  readonly worstFrameMs: number;
}

export interface FrameMeter {
  /** Записывает длительность очередного кадра в миллисекундах. */
  add(deltaMs: number): void;
  stats(): FrameStats;
}

export function createFrameMeter(): FrameMeter {
  let frames: number[] = [];
  let total = 0;
  return {
    add: (deltaMs) => {
      if (!(deltaMs > 0)) {
        return;
      }
      frames.push(deltaMs);
      total += deltaMs;
      // Старые кадры выпадают из окна; последний кадр остаётся всегда.
      let drop = 0;
      while (drop < frames.length - 1 && total - (frames[drop] ?? 0) >= WINDOW_MS) {
        total -= frames[drop] ?? 0;
        drop += 1;
      }
      if (drop > 0) {
        frames = frames.slice(drop);
      }
    },
    stats: () => {
      if (frames.length === 0) {
        return { fps: 0, minFps: 0, worstFrameMs: 0 };
      }
      const worst = Math.max(...frames);
      return {
        fps: Math.round((frames.length * 1000) / total),
        minFps: Math.round(1000 / worst),
        worstFrameMs: Math.round(worst),
      };
    },
  };
}
