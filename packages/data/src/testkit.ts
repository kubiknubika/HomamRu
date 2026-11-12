/** Помощники для тестов сохранения. В игру не входят. */

/** Собирает текст записи с верной контрольной суммой для произвольного JSON — тем же FNV-1a. */
export function withChecksumOf(json: string): string {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}\n${json}`;
}
