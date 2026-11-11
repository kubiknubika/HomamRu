/** Двоичная куча чисел: наименьшее число выходит первым. Нужна поиску пути. */
export class MinHeap {
  private readonly items: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(value: number): void {
    const items = this.items;
    let index = items.length;
    items.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      const parentValue = items[parent] ?? 0;
      if (parentValue <= value) {
        break;
      }
      items[index] = parentValue;
      index = parent;
    }
    items[index] = value;
  }

  /** Достаёт наименьшее число; у пустой кучи — `undefined`. */
  pop(): number | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined || items.length === 0) {
      return top;
    }
    let index = 0;
    for (;;) {
      let child = index * 2 + 1;
      if (child >= items.length) {
        break;
      }
      const right = child + 1;
      if (right < items.length && (items[right] ?? 0) < (items[child] ?? 0)) {
        child = right;
      }
      const childValue = items[child] ?? 0;
      if (childValue >= last) {
        break;
      }
      items[index] = childValue;
      index = child;
    }
    items[index] = last;
    return top;
  }
}
