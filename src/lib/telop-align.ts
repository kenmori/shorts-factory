/**
 * テロップと「本当に喋っている内容」の突き合わせ（純関数）。
 *
 * **モードBの正しさは目では確かめられない。** 認識が間違っていても、
 * 時刻が全部 0.5秒 遅れていても、動画を見た印象は「だいたい合っている」になる。
 *
 * そこで、自前で作った動画（モードA。字幕の時刻が既知）を素材にして
 * モードBの工程を丸ごと通し、**文字ごとの時刻**を突き合わせる。
 * 字を一列に並べて対応をとり（最長共通部分列）、対応した字の時刻差を見る。
 */

export type TimedChar = { char: string; ms: number };

export type Span = { text: string; startMs: number; endMs: number };

/**
 * 区間の並びを「文字ごとの時刻」にほぐす。
 * 区間の中では等速に喋っているとみなす（1文字あたり数十msの誤差）。
 */
export const toTimedChars = (spans: Span[]): TimedChar[] => {
  const out: TimedChar[] = [];
  for (const span of spans) {
    const chars = [...span.text];
    if (chars.length === 0) {
      continue;
    }
    const step = (span.endMs - span.startMs) / chars.length;
    for (let i = 0; i < chars.length; i++) {
      out.push({ char: chars[i] as string, ms: span.startMs + step * (i + 0.5) });
    }
  }
  return out;
};

/** 突き合わせの結果 */
export type Alignment = {
  /** 対応がついた文字数 */
  matched: number;
  truthChars: number;
  actualChars: number;
  /** 対応がついた文字の割合（認識の精度） */
  matchRate: number;
  /** 対応した文字の時刻差（actual - truth, ms）。正ならテロップが遅い */
  offsetsMs: number[];
};

/**
 * 最長共通部分列で対応をとる。
 * 認識の誤り（抜け・混入・誤字）を飛ばして、合っている字だけ比べるため。
 */
export const alignTimedChars = (truth: TimedChar[], actual: TimedChar[]): Alignment => {
  const n = truth.length;
  const m = actual.length;
  // dp[i][j] = truth[i..] と actual[j..] の最長共通部分列の長さ
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        truth[i]?.char === actual[j]?.char
          ? (dp[(i + 1) * width + (j + 1)] as number) + 1
          : Math.max(dp[(i + 1) * width + j] as number, dp[i * width + (j + 1)] as number);
    }
  }

  const offsetsMs: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (truth[i]?.char === actual[j]?.char) {
      offsetsMs.push((actual[j] as TimedChar).ms - (truth[i] as TimedChar).ms);
      i++;
      j++;
    } else if ((dp[(i + 1) * width + j] as number) >= (dp[i * width + (j + 1)] as number)) {
      i++;
    } else {
      j++;
    }
  }

  return {
    matched: offsetsMs.length,
    truthChars: n,
    actualChars: m,
    matchRate: n === 0 ? 0 : offsetsMs.length / n,
    offsetsMs,
  };
};

export const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index] as number;
};

export type AlignmentReport = Alignment & {
  /** 時刻差の中央値（ms）。系統的な遅れ／進みが出る */
  medianOffsetMs: number;
  /** 時刻差の絶対値の中央値と p95（ms）。ばらつきが出る */
  medianAbsOffsetMs: number;
  p95AbsOffsetMs: number;
};

export const alignmentReport = (truth: Span[], actual: Span[]): AlignmentReport => {
  const alignment = alignTimedChars(toTimedChars(truth), toTimedChars(actual));
  const abs = alignment.offsetsMs.map(Math.abs);
  return {
    ...alignment,
    medianOffsetMs: percentile(alignment.offsetsMs, 0.5),
    medianAbsOffsetMs: percentile(abs, 0.5),
    p95AbsOffsetMs: percentile(abs, 0.95),
  };
};
