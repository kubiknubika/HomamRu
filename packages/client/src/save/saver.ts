/**
 * Пишет автосохранение: по очереди в две копии, всегда поверх более старой.
 * Спецификация: docs/mechanics/04-save.md, раздел «Надёжность записи».
 */
import { encodeSave } from "@homamru/data";
import type { SaveBody, SaveSlot } from "@homamru/data";
import type { SaveStorage } from "./saveStorage.ts";

export interface Saver {
  /** Ставит запись в очередь. Если предыдущая ещё пишется, на диск попадёт только последняя. */
  save(body: SaveBody): void;
  /** Ждёт, пока очередь опустеет. Нужен тестам. */
  idle(): Promise<void>;
}

export interface SaverStart {
  /** Порядковый номер последней записи в хранилище; `-1`, если записей нет. */
  readonly seq: number;
  /** Копия, в которой лежит последняя целая запись; `null`, если её нет. */
  readonly slot: SaveSlot | null;
}

export function createSaver(storage: SaveStorage, start: SaverStart, onError: () => void): Saver {
  let { seq } = start;
  /** Копия с последней целой записью: её не трогаем, пишем в другую. */
  let good: SaveSlot | null = start.slot;
  let pending: SaveBody | null = null;
  let running: Promise<void> = Promise.resolve();
  let busy = false;
  let reported = false;

  async function pump(): Promise<void> {
    while (pending !== null) {
      const body = pending;
      pending = null;
      const slot: SaveSlot = good === 0 ? 1 : 0;
      seq += 1;
      try {
        await storage.write(slot, encodeSave(body, seq));
        good = slot;
      } catch {
        // Игра продолжается без сохранения; предупреждение показывается один раз.
        if (!reported) {
          reported = true;
          onError();
        }
      }
    }
    busy = false;
  }

  return {
    save: (body) => {
      pending = body;
      if (!busy) {
        busy = true;
        running = pump();
      }
    },
    idle: () => running,
  };
}
