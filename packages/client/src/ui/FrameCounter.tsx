import { useEffect, useState } from "react";
import type { FrameMeter } from "../game/frameMeter.ts";

const REFRESH_MS = 500;

/** Номер сборки: его подставляет CI, чтобы было видно, какая версия установлена. */
const BUILD_ID: unknown = import.meta.env["VITE_BUILD_ID"];

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
      {typeof BUILD_ID === "string" && <div className="hud-build">Сборка {BUILD_ID}</div>}
    </div>
  );
}
