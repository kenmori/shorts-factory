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

export type Mora = {
  text: string;
  consonant: string | null;
  consonant_length: number | null;
  vowel: string;
  vowel_length: number;
  pitch: number;
};

export type AccentPhrase = {
  moras: Mora[];
  accent: number;
  pause_mora: Mora | null;
  is_interrogative?: boolean;
};

export type AudioQuery = {
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

/** GET /speakers の応答 */
export type SpeakerInfo = {
  name: string;
  speaker_uuid: string;
  styles: { name: string; id: number; type?: string }[];
};

/**
 * 話者名とスタイル名から style id を選ぶ。
 *
 * **番号をコードに書かない。** ENGINE が返す一覧から引く。
 * VOICEVOX のバージョンでキャラが増減するし、番号を推測で書くと
 * 別のキャラの声で無言に合成されるのが最悪（規約違反にもなりうる）。
 */
export const pickStyleId = (
  speakers: SpeakerInfo[],
  speakerName: string,
  styleName: string | null,
): number => {
  const speaker = speakers.find((s) => s.name === speakerName);
  if (!speaker) {
    throw new Error(
      [
        `VOICEVOX に話者「${speakerName}」が見つからない。`,
        "config/pipeline.ts の voicevox.speakerName を直す。使える話者:",
        ...speakers.map((s) => `  - ${s.name}（${s.styles.map((t) => t.name).join(" / ")}）`),
      ].join("\n"),
    );
  }
  const wanted = styleName ?? "ノーマル";
  const style =
    speaker.styles.find((t) => t.name === wanted) ??
    (styleName === null ? speaker.styles[0] : undefined);
  if (!style) {
    throw new Error(
      `「${speakerName}」にスタイル「${styleName}」が無い。` +
        `使えるスタイル: ${speaker.styles.map((t) => t.name).join(" / ")}`,
    );
  }
  return style.id;
};

export const fetchSpeakers = async (): Promise<SpeakerInfo[]> =>
  (await (await request("/speakers")).json()) as SpeakerInfo[];

/** 解決した style id。プロセス内で1回だけ引く */
let speakerId: Promise<number> | null = null;

export const resolveSpeakerId = (): Promise<number> => {
  speakerId ??= fetchSpeakers().then((speakers) =>
    pickStyleId(speakers, vv.speakerName, vv.styleName),
  );
  return speakerId;
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

/**
 * `/audio_query` の結果に config の調整値を載せて返す。
 * モーラ音長が入っているので、ここが日本語の字幕タイミングの一次情報になる。
 */
export const audioQuery = async (text: string): Promise<AudioQuery> => {
  const speaker = await resolveSpeakerId();
  const query = (await (
    await request(`/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`, {
      method: "POST",
    })
  ).json()) as AudioQuery;

  return {
    ...query,
    speedScale: vv.speedScale,
    pitchScale: vv.pitchScale,
    intonationScale: vv.intonationScale,
    prePhonemeLength: vv.prePhonemeLength,
    postPhonemeLength: vv.postPhonemeLength,
  };
};

export const synthesizeQuery = async (query: AudioQuery): Promise<Buffer> => {
  const speaker = await resolveSpeakerId();
  const res = await request(`/synthesis?speaker=${speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/wav" },
    body: JSON.stringify(query),
  });
  return Buffer.from(await res.arrayBuffer());
};

const synthesizeChunk = async (text: string): Promise<Buffer> =>
  synthesizeQuery(await audioQuery(text));

export const voicevoxEngine: TtsEngine = {
  id: "voicevox",
  signature: `voicevox:speaker=${vv.speakerName}/${vv.styleName ?? "ノーマル"}:speed=${vv.speedScale}:pitch=${vv.pitchScale}:into=${vv.intonationScale}:pre=${vv.prePhonemeLength}:post=${vv.postPhonemeLength}`,
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
