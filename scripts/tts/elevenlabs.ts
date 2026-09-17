/**
 * ElevenLabs（声質優先 / 有料 / ネットワーク必須）。
 *
 * `/with-timestamps` は base64 音声と一緒に文字ごとの開始・終了時刻を返す。
 * **原稿が既知なので誤認識がゼロ。** これが採用理由（Whisper ルートを
 * 第一候補にしない理由は plan.md「字幕タイミングの取得方法」）。
 *
 * ⚠️ 正規化の挙動は未検証（plan.md M2 の最初に実測する項目）。
 * `alignment.characters` が原稿と一致しない応答が来たら、**黙って近い位置に
 * 割り当てず、エラーで落とす。** 字幕が数百ミリ秒ずれた動画を無言で出すより、
 * 止まったほうが安い。
 */
import { config } from "../../config/pipeline.ts";
import {
  locateChunks,
  type CacheFn,
  type ChunkTiming,
  type SynthSegment,
  type TtsEngine,
  type Utterance,
} from "./types.ts";

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type WithTimestampsResponse = {
  audio_base64: string;
  alignment: Alignment | null;
  normalized_alignment: Alignment | null;
};

/** 音声から復元できない情報。キャッシュに音声と一緒に保存する */
type Meta = { captions: ChunkTiming[]; durationSec: number };

const el = config.elevenlabs;

const pickAlignment = (res: WithTimestampsResponse, text: string): Alignment => {
  if (res.alignment && res.alignment.characters.join("") === text) {
    return res.alignment;
  }
  if (res.normalized_alignment && res.normalized_alignment.characters.join("") === text) {
    console.warn("  WARN ElevenLabs: alignment が原稿と不一致。normalized_alignment を使った");
    return res.normalized_alignment;
  }
  throw new Error(
    [
      "ElevenLabs の文字アライメントが原稿と一致しない。",
      "正規化（例: 「3」→「さん」）で文字インデックスの対応が崩れている。",
      "字幕がずれるので合成を中止した。対処は次のどちらか:",
      "  - config の tts を voicevox にする（モーラ単位なのでインデックス対応が不要）",
      "  - 原稿から正規化対象の表記（数字・記号）を外して読みを直接書く",
      `原稿: ${text}`,
    ].join("\n"),
  );
};

const call = async (
  text: string,
  ranges: { start: number; end: number }[],
  chunks: string[],
): Promise<{ audio: Buffer; meta: Meta }> => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY が無い。.env を設定するか config の tts を voicevox にする");
  }
  if (!el.voiceId) {
    throw new Error("ELEVENLABS_VOICE_ID が無い");
  }

  const res = await fetch(`${el.endpoint}/v1/text-to-speech/${el.voiceId}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: el.modelId }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs が ${res.status} を返した: ${await res.text()}`);
  }

  const body = (await res.json()) as WithTimestampsResponse;
  const alignment = pickAlignment(body, text);
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  if (starts.length !== alignment.characters.length || ends.length !== alignment.characters.length) {
    throw new Error("ElevenLabs のアライメント配列の長さが文字数と合わない");
  }

  const captions: ChunkTiming[] = chunks.map((chunkText, i) => {
    const range = ranges[i];
    if (!range) {
      throw new Error("チャンクの文字範囲が取れない");
    }
    const startSec = starts[range.start];
    const endSec = ends[range.end - 1];
    if (startSec === undefined || endSec === undefined) {
      throw new Error(`チャンク "${chunkText}" の時刻がアライメントから取れない`);
    }
    return { text: chunkText, startSec, endSec };
  });

  const durationSec = ends[ends.length - 1];
  if (durationSec === undefined || durationSec <= 0) {
    throw new Error("ElevenLabs の応答から尺が取れない");
  }

  return { audio: Buffer.from(body.audio_base64, "base64"), meta: { captions, durationSec } };
};

export const elevenlabsEngine: TtsEngine = {
  id: "elevenlabs",
  signature: `elevenlabs:voice=${el.voiceId}:model=${el.modelId}`,
  ext: "mp3",
  /**
   * 発話をまとめて1回だけ叩く（リクエスト数が課金に効くのでチャンクごとには叩かない）。
   * 字幕の境界は文字インデックスから復元する。
   *
   * キャッシュキーは "|" を除去した原稿なので、"|" の位置だけを動かした場合は
   * キャッシュに当たる。ただしチャンク境界はキャッシュ後に再計算できないため、
   * 境界を動かしたときは meta の captions を作り直す必要がある
   * → キーに境界のハッシュを混ぜず、captions は locateChunks から引き直す。
   */
  synthesize: async (utterance: Utterance, cache: CacheFn): Promise<SynthSegment[]> => {
    const ranges = locateChunks(utterance.text, utterance.chunks);
    const { audio, meta } = await cache<Meta>(utterance.text, () =>
      call(utterance.text, ranges, utterance.chunks),
    );

    const boundariesMatch =
      meta.captions.length === utterance.chunks.length &&
      meta.captions.every((c, i) => c.text === utterance.chunks[i]);

    if (boundariesMatch) {
      return [{ audio, durationSec: meta.durationSec, captions: meta.captions }];
    }

    // "|" を動かした場合。音声は使い回せるが境界の時刻は作り直す必要がある。
    // 文字ごとの時刻はキャッシュに残っていないため、ここで推測はせず落とす。
    throw new Error(
      [
        "キャッシュ済み音声のチャンク境界が台本と違う（ElevenLabs 経路）。",
        "文字ごとの時刻は音声から復元できないため、推測では字幕を作らない。",
        "対処: .cache/audio/ の該当ファイルを消して再合成する（課金あり）か、",
        "      tts を voicevox にする（チャンク単位で合成するのでこの制約がない）。",
      ].join("\n"),
    );
  },
};
