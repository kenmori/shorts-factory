/**
 * 無音を返すだけのエンジン。
 *
 * **投稿用の動画には使わない。** publish-check が mock 由来のタイムラインを
 * 落とす。用途は次の2つだけ:
 *   - 音声エンジンを立てられない環境（CI）で配線とレンダーを検証する
 *   - テンプレのレイアウトを詰める（尺の当たりだけ欲しい）
 *
 * 尺は日本語の平均発話速度からの概算。実測ではないので、
 * ここで詰めた尺をそのまま信用しないこと。
 */
import { silentWav } from "../lib/wav.ts";
import type { CacheFn, SynthSegment, TtsEngine, Utterance } from "./types.ts";

/** 1文字あたりの秒数（日本語・やや速め）。実測ではない */
const SEC_PER_CHAR = 0.135;
const MIN_SEC = 0.8;
const TAIL_SEC = 0.12;

export const estimateDurationSec = (text: string): number =>
  Math.max(MIN_SEC, text.replace(/\s+/g, "").length * SEC_PER_CHAR + TAIL_SEC);

export const mockEngine: TtsEngine = {
  id: "mock",
  signature: `mock:sec_per_char=${SEC_PER_CHAR}`,
  ext: "wav",
  synthesize: async (utterance: Utterance, cache: CacheFn): Promise<SynthSegment[]> => {
    const segments: SynthSegment[] = [];
    for (const chunk of utterance.chunks) {
      const durationSec = estimateDurationSec(chunk);
      const { audio } = await cache<null>(chunk, async () => ({
        audio: silentWav(durationSec),
        meta: null,
      }));
      segments.push({
        audio,
        durationSec,
        captions: [{ text: chunk, startSec: 0, endSec: durationSec }],
      });
    }
    return segments;
  },
};
