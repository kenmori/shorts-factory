/**
 * 画像の切り替え時刻を決める。
 *
 * **字幕のチャンク境界に合わせる。** チャンクの時刻は音声の実測値なので、
 * 絵の切り替えが喋りの区切りと一致する。等間隔で割ると喋りの途中で
 * 絵が変わって落ち着かない。
 *
 * チャンクが画像の枚数より少ない場合だけ、尺を等分する。
 */
export const shotBoundaries = (input: {
  /** セクション先頭を0とした、そのセクション内の字幕の開始秒 */
  captionStartsSec: number[];
  /** セクションの尺 */
  durationSec: number;
  shotCount: number;
}): number[] => {
  const { captionStartsSec, durationSec, shotCount } = input;
  if (shotCount <= 1) {
    return [0];
  }
  if (captionStartsSec.length < shotCount) {
    // チャンクが足りないので等分する
    return Array.from({ length: shotCount }, (_, i) => (durationSec * i) / shotCount);
  }

  const perShot = captionStartsSec.length / shotCount;
  return Array.from({ length: shotCount }, (_, i) => {
    if (i === 0) {
      return 0;
    }
    const index = Math.min(captionStartsSec.length - 1, Math.round(i * perShot));
    return captionStartsSec[index] ?? (durationSec * i) / shotCount;
  });
};

/** 各画像の [開始, 尺] を返す */
export const shotSpans = (
  boundaries: number[],
  durationSec: number,
): { startSec: number; durationSec: number }[] =>
  boundaries.map((startSec, i) => ({
    startSec,
    durationSec: Math.max(0.1, (boundaries[i + 1] ?? durationSec) - startSec),
  }));
