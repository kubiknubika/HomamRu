/**
 * Детерминированный генератор случайных чисел (догма 7).
 *
 * Состояние — обычный объект, который хранится в игровом состоянии и
 * сохраняется вместе с ним. Функции ничего не меняют на месте: каждая
 * возвращает значение и новое состояние.
 *
 * Алгоритм — mulberry32: только целочисленные операции, поэтому результат
 * одинаков на любой платформе.
 */
export interface RngState {
  readonly s: number;
}

export interface RngResult<T> {
  readonly value: T;
  readonly rng: RngState;
}

const UINT32_RANGE = 0x1_0000_0000;

/** Создаёт генератор из сида. Сид приводится к целому без знака (32 бита). */
export function createRng(seed: number): RngState {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`Сид должен быть конечным числом, получено: ${seed}`);
  }
  return { s: Math.trunc(seed) >>> 0 };
}

/** Следующее целое в диапазоне [0, 2^32). */
export function nextUint32(rng: RngState): RngResult<number> {
  const s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: (t ^ (t >>> 14)) >>> 0, rng: { s } };
}

/** Следующее дробное число в диапазоне [0, 1). */
export function nextFloat(rng: RngState): RngResult<number> {
  const next = nextUint32(rng);
  return { value: next.value / UINT32_RANGE, rng: next.rng };
}

/**
 * Следующее целое в диапазоне [min, max], обе границы включены.
 * Числа, которые дали бы перекос, отбрасываются, поэтому все значения равновероятны.
 */
export function nextInt(rng: RngState, min: number, max: number): RngResult<number> {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new RangeError(`Границы должны быть целыми числами, получено: ${min}, ${max}`);
  }
  if (min > max) {
    throw new RangeError(`Нижняя граница больше верхней: ${min} > ${max}`);
  }
  const span = max - min + 1;
  if (span > UINT32_RANGE) {
    throw new RangeError(`Диапазон слишком велик: ${span}`);
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % span);
  let next = nextUint32(rng);
  while (next.value >= limit) {
    next = nextUint32(next.rng);
  }
  return { value: min + (next.value % span), rng: next.rng };
}
