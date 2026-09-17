import type { TtsEngineId } from "../../config/pipeline.ts";

/** セグメント内の字幕チャンク（セグメント先頭からの相対秒） */
export type ChunkTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

/** 合成の単位。音声ファイル1つに対応する */
export type SynthSegment = {
  audio: Buffer;
  durationSec: number;
  captions: ChunkTiming[];
};

/**
 * 1発話（1セクションの narration、または outro）。
 *
 * - `text`: TTS へ渡す原稿。"|" を除去しただけで、それ以外は原文のまま
 * - `chunks`: "|" で割った字幕チャンク
 */
export type Utterance = {
  text: string;
  chunks: string[];
};

/**
 * 内容アドレスキャッシュ。
 *
 * `key` は**"|" を含まないテキスト**。字幕の割れ方を変えても、
 * 合成にかけるテキストが同じならキャッシュに当たる。
 * meta は音声と一緒に保存する（タイムスタンプなど、音声から復元できない情報）。
 */
export type CacheFn = <T>(
  key: string,
  produce: () => Promise<{ audio: Buffer; meta: T }>,
) => Promise<{ audio: Buffer; meta: T }>;

export type TtsEngine = {
  readonly id: TtsEngineId;
  /** エンジン＋話者＋モデル。キャッシュキーとタイムラインに入る */
  readonly signature: string;
  readonly ext: "wav" | "mp3";
  /**
   * 1発話を音声化する。
   * どの粒度で合成するか（チャンクごと / 発話まとめて）はエンジンが決める。
   */
  synthesize(utterance: Utterance, cache: CacheFn): Promise<SynthSegment[]>;
};

/** チャンクが原稿のどこにあるかを求める。先頭から順に探すので重複語でもずれない */
export const locateChunks = (
  text: string,
  chunks: string[],
): { start: number; end: number }[] => {
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const start = text.indexOf(chunk, cursor);
    if (start === -1) {
      throw new Error(`チャンク "${chunk}" が原稿中に見つからない（原稿: ${text}）`);
    }
    ranges.push({ start, end: start + chunk.length });
    cursor = start + chunk.length;
  }
  return ranges;
};
