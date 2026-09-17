/**
 * VOICEVOX（ローカル / localhost:50021 / 課金ゼロ）。
 *
 * **チャンクごとに合成して並べる。** こうすると字幕の境界が構造的に確定するので、
 * "|" から文字インデックスを逆算する処理そのものが要らなくなる
 * （plan.md「TTS の選択」）。尺は返ってきた WAV の実測値なので、
 * モーラ長の足し算とズレる余地がない。
 *
 * キャッシュはチャンク単位。キーはチャンクの文面（"|" を含まない）なので、
 * "|" を動かしても文面が変わらないチャンクの音声は再生成されない。
 */
import { config } from "../../config/pipeline.ts";
import { wavDurationSec } from "../lib/wav.ts";
import type { CacheFn, SynthSegment, TtsEngine, Utterance } from "./types.ts";

type Mora = {
  text: string;
  consonant: string | null;
  consonant_length: number | null;
  vowel: string;
  vowel_length: number;
  pitch: number;
};

type AccentPhrase = {
  moras: Mora[];
  accent: number;
  pause_mora: Mora | null;
  is_interrogative?: boolean;
};

type AudioQuery = {
  accent_phrases: AccentPhrase[];
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
  outputStereo: boolean;
  kana?: string;
};

const vv = config.voicevox;

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  const url = `${vv.endpoint}${path}`;
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `VOICEVOX ENGINE に繋がらない（${vv.endpoint}）。起動してから再実行する: ${String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`VOICEVOX ${path} が ${res.status} を返した: ${await res.text()}`);
  }
  return res;
};

/** モーラ長から尺を出す。WAV 実測値との突き合わせ（設計の検算）に使う */
export const durationFromQuery = (q: AudioQuery): number => {
  let sec = 0;
  for (const phrase of q.accent_phrases) {
    for (const mora of phrase.moras) {
      sec += (mora.consonant_length ?? 0) + mora.vowel_length;
    }
    if (phrase.pause_mora) {
      sec += (phrase.pause_mora.consonant_length ?? 0) + phrase.pause_mora.vowel_length;
    }
  }
  return sec / q.speedScale + q.prePhonemeLength + q.postPhonemeLength;
};

const synthesizeChunk = async (text: string): Promise<Buffer> => {
  const query = (await (
    await request(`/audio_query?speaker=${vv.speaker}&text=${encodeURIComponent(text)}`, {
      method: "POST",
    })
  ).json()) as AudioQuery;

  const tuned: AudioQuery = {
    ...query,
    speedScale: vv.speedScale,
    pitchScale: vv.pitchScale,
    intonationScale: vv.intonationScale,
    prePhonemeLength: vv.prePhonemeLength,
    postPhonemeLength: vv.postPhonemeLength,
  };

  const res = await request(`/synthesis?speaker=${vv.speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/wav" },
    body: JSON.stringify(tuned),
  });
  return Buffer.from(await res.arrayBuffer());
};

export const voicevoxEngine: TtsEngine = {
  id: "voicevox",
  signature: `voicevox:speaker=${vv.speaker}:speed=${vv.speedScale}:pitch=${vv.pitchScale}:into=${vv.intonationScale}:pre=${vv.prePhonemeLength}:post=${vv.postPhonemeLength}`,
  ext: "wav",
  synthesize: async (utterance: Utterance, cache: CacheFn): Promise<SynthSegment[]> => {
    const segments: SynthSegment[] = [];
    for (const chunk of utterance.chunks) {
      const { audio } = await cache<null>(chunk, async () => ({
        audio: await synthesizeChunk(chunk),
        meta: null,
      }));
      const durationSec = wavDurationSec(audio);
      segments.push({
        audio,
        durationSec,
        captions: [{ text: chunk, startSec: 0, endSec: durationSec }],
      });
    }
    return segments;
  },
};
