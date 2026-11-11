import { useState } from "react";

interface AppProps {
  readonly initialSeed: number;
  readonly onSeedChange: (seed: number) => void;
}

/** Проверочная панель каркаса: показывает сид и позволяет его сменить. */
export function App({ initialSeed, onSeedChange }: AppProps) {
  const [seed, setSeed] = useState(initialSeed);

  const nextSeed = () => {
    const next = seed + 1;
    setSeed(next);
    onSeedChange(next);
  };

  return (
    <div className="panel">
      <h1>HomamRu</h1>
      <p>
        Проверка каркаса: поле рисует Phaser, цвета выбирает ядро, эта панель — обычная вёрстка.
        Сид: {seed}.
      </p>
      <button type="button" onClick={nextSeed}>
        Следующий сид
      </button>
    </div>
  );
}
