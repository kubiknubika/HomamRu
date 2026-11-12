import { useEffect, useState } from "react";
import { BUILD_ID } from "../diagnostics/version.ts";
import type { FrameMeter } from "../game/frameMeter.ts";

const REFRESH_MS = 500;

interface FrameCounterProps {
  readonly frameMeter: FrameMeter;
}

/** Счётчик кадров: средняя и наименьшая частота, самый долгий кадр за три секунды. */
export function FrameCounter({ frameMeter }: FrameCounterProps) {
  const [stats, setStats] = useState(frameMeter.stats);

  useEffect(() => {
    const timer = setInterval(() => {
      setStats(frameMeter.stats());
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [frameMeter]);

  return (
    <div className="hud hud-frames">
      Кадров: {stats.fps} · мин {stats.minFps} · худший {stats.worstFrameMs} мс
      {BUILD_ID !== null && <div className="hud-build">Сборка {BUILD_ID}</div>}
    </div>
  );
}
