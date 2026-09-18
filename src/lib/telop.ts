/**
 * 音声認識の出力からテロップの区間を作る（モードB）。
 *
 * ここは**純関数だけ**。whisper の型にも fs にも依存しない。
 * 「音とテロップが合っている」は目で見て確かめるものではないので、
 * 不変条件をここに閉じ込めてテストで押さえる。
 *
 * 守る不変条件:
 *  1. 開始 < 終了（0 秒のテロップは一瞬光って消える）
 *  2. 単調増加かつ重ならない（2枚が同時に出ない）
 *  3. すべて音声の長さの中（動画が終わった後に字が出ない）
 *  4. 文字を落とさない（認識結果の連結 = テロップの連結）
 */

/** 認識結果のトークン1つ。whisper のトークン単位の時刻をこの形に落として渡す */
export type AsrToken = {
  text: string;
  fromMs: number;
  toMs: number;
};

export type TelopChunk = {
  text: string;
  startMs: number;
  endMs: number;
};

export type TelopOptions = {
  /** 1枚の上限文字数 */
  maxChars: number;
  /** 1枚の上限（ミリ秒）。長いと画面が止まって見える */
  maxDurationMs: number;
  /** 1枚の下限（ミリ秒）。短いと点滅する */
  minDurationMs: number;
  /** 音声の長さ（ミリ秒）。これを超える区間は作らない */
  audioDurationMs: number;
};

export const DEFAULT_TELOP_OPTIONS: Omit<TelopOptions, "audioDurationMs"> = {
  maxChars: 18,
  maxDurationMs: 2000,
  minDurationMs: 400,
};

/** 文の終わり。ここは必ず割る */
const SENTENCE_END = /[。！？!?]$/;
/** 文の途中の切れ目。ある程度たまっていれば割る */
const CLAUSE_END = /[、,]$/;

/**
 * whisper が混ぜてくる制御トークン。
 * `[_BEG_]` `[_TT_123]` `<|ja|>` などが本文に入ると、テロップに記号が出る。
 */
const isSpecialToken = (text: string): boolean =>
  /^\[.*\]$/.test(text) || /^<\|.*\|>$/.test(text);

/** 本文として使えるトークンだけ残し、時刻を単調・範囲内に整える */
export const sanitizeTokens = (tokens: AsrToken[], audioDurationMs: number): AsrToken[] => {
  const out: AsrToken[] = [];
  let floor = 0;
  for (const token of tokens) {
    const text = token.text.trim();
    if (text === "" || isSpecialToken(text)) {
      continue;
    }
    const from = clamp(Number.isFinite(token.fromMs) ? token.fromMs : floor, floor, audioDurationMs);
    const to = clamp(Number.isFinite(token.toMs) ? token.toMs : from, from, audioDurationMs);
    out.push({ text, fromMs: from, toMs: to });
    floor = from;
  }
  return out;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * トークンをテロップ1枚ぶんにまとめる。
 * 文字数・尺の上限で割り、句読点があればそこを優先する。
 */
export const groupTokens = (tokens: AsrToken[], opts: TelopOptions): TelopChunk[] => {
  const chunks: TelopChunk[] = [];
  let buffer: AsrToken[] = [];

  const flush = (): void => {
    if (buffer.length === 0) {
      return;
    }
    const first = buffer[0] as AsrToken;
    const last = buffer[buffer.length - 1] as AsrToken;
    chunks.push({
      text: buffer.map((t) => t.text).join(""),
      startMs: first.fromMs,
      endMs: Math.max(last.toMs, first.fromMs),
    });
    buffer = [];
  };

  for (const token of tokens) {
    const chars = buffer.reduce((sum, t) => sum + t.text.length, 0);
    const start = buffer[0]?.fromMs ?? token.fromMs;
    const wouldBeChars = chars + token.text.length;
    const wouldBeMs = token.toMs - start;

    // 先に入れると溢れる場合は、入れる前に切る（1トークンだけは必ず入れる）
    if (buffer.length > 0 && (wouldBeChars > opts.maxChars || wouldBeMs > opts.maxDurationMs)) {
      flush();
    }
    buffer.push(token);

    const text = token.text;
    if (SENTENCE_END.test(text)) {
      flush();
      continue;
    }
    const filled = buffer.reduce((sum, t) => sum + t.text.length, 0);
    if (CLAUSE_END.test(text) && filled >= Math.ceil(opts.maxChars / 2)) {
      flush();
    }
  }
  flush();
  return chunks;
};

/**
 * 区間を整える。**ここが「音と合っている」の最後の砦。**
 *
 * - 次の開始を越えない（重ならない）
 * - 音声の長さを越えない
 * - 下限の尺は確保する（ただし次の開始と音声長が優先）
 */
export const normalizeSpans = (chunks: TelopChunk[], opts: TelopOptions): TelopChunk[] => {
  const limit = opts.audioDurationMs;
  const out: TelopChunk[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] as TelopChunk;
    const prev = out[out.length - 1];
    const start = clamp(chunk.startMs, prev ? prev.endMs : 0, limit);
    const nextStart = chunks[i + 1]?.startMs ?? limit;
    const ceiling = Math.min(clamp(nextStart, start, limit), limit);
    // 下限を確保するが、次の開始と音声長は越えない
    const wanted = Math.max(chunk.endMs, start + opts.minDurationMs);
    const end = Math.max(Math.min(wanted, ceiling), start);
    if (end <= start) {
      // 詰められて幅が無くなった。出すと一瞬光るだけなので落とす
      continue;
    }
    out.push({ text: chunk.text, startMs: start, endMs: end });
  }
  return out;
};

export const toTelopChunks = (tokens: AsrToken[], opts: TelopOptions): TelopChunk[] =>
  normalizeSpans(groupTokens(sanitizeTokens(tokens, opts.audioDurationMs), opts), opts);

export type TelopProblem = {
  rule:
    | "empty-text"
    | "zero-length"
    | "overlap"
    | "out-of-range"
    | "too-long"
    | "too-short"
    | "text-lost";
  message: string;
};

/**
 * 出来上がったテロップを機械で見る。**空配列でなければ投稿しない。**
 * `spokenText` を渡すと「認識した文字が全部テロップに入っているか」も見る。
 */
export const checkTelopChunks = (
  chunks: TelopChunk[],
  opts: TelopOptions & { spokenText?: string },
): TelopProblem[] => {
  const problems: TelopProblem[] = [];
  const at = (i: number): string => `${i + 1}枚目`;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] as TelopChunk;
    if (chunk.text.trim() === "") {
      problems.push({ rule: "empty-text", message: `${at(i)} が空` });
    }
    if (chunk.endMs <= chunk.startMs) {
      problems.push({
        rule: "zero-length",
        message: `${at(i)} の尺が 0 以下（${chunk.startMs}→${chunk.endMs}ms）`,
      });
    }
    if (chunk.startMs < 0 || chunk.endMs > opts.audioDurationMs + 1) {
      problems.push({
        rule: "out-of-range",
        message: `${at(i)} が音声の外（${chunk.startMs}→${chunk.endMs}ms / 音声 ${opts.audioDurationMs}ms）`,
      });
    }
    const duration = chunk.endMs - chunk.startMs;
    if (duration > opts.maxDurationMs + 1) {
      problems.push({
        rule: "too-long",
        message: `${at(i)} が ${(duration / 1000).toFixed(2)}秒（上限 ${opts.maxDurationMs / 1000}秒）`,
      });
    }
    if (duration < opts.minDurationMs && chunk.endMs < opts.audioDurationMs) {
      problems.push({
        rule: "too-short",
        message: `${at(i)} が ${duration}ms（下限 ${opts.minDurationMs}ms）。点滅して見える`,
      });
    }
    const next = chunks[i + 1];
    if (next && next.startMs < chunk.endMs) {
      problems.push({
        rule: "overlap",
        message: `${at(i)} と ${at(i + 1)} が重なっている（${chunk.endMs} > ${next.startMs}ms）`,
      });
    }
  }

  if (opts.spokenText !== undefined) {
    const joined = chunks.map((c) => c.text).join("");
    if (joined !== opts.spokenText) {
      problems.push({
        rule: "text-lost",
        message:
          "テロップの連結が認識結果と一致しない（文字が落ちているか増えている）\n" +
          `    認識: ${opts.spokenText.slice(0, 60)}\n    テロップ: ${joined.slice(0, 60)}`,
      });
    }
  }
  return problems;
};

/** そのミリ秒に出ているテロップ。描画側から使う */
export const telopAt = (chunks: TelopChunk[], nowMs: number): TelopChunk | undefined =>
  chunks.find((c) => nowMs >= c.startMs && nowMs < c.endMs);
