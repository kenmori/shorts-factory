/**
 * 決定的ハッシュ。**Remotion のバンドル（ブラウザ）側でも使うので
 * node:crypto に依存しない実装にしている。**
 * キャッシュキー用の sha256 は scripts/lib/hash.ts 側（Node 専用）。
 */

/** FNV-1a 32bit */
export const hash32 = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

/** 配列から決定的に1つ選ぶ。salt を変えると別の軸として独立に回る */
export const pickDeterministic = <T>(items: readonly T[], seed: string, salt: string): T => {
  if (items.length === 0) {
    throw new Error("pickDeterministic: 候補が空");
  }
  const index = hash32(`${salt}:${seed}`) % items.length;
  // noUncheckedIndexedAccess 対策。index は必ず範囲内
  return items[index] as T;
};
