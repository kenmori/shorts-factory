/**
 * 動画から音声認識用の WAV を作る（モードB: 既存の動画にテロップを付ける）。
 *
 * whisper.cpp は **16kHz モノラル 16bit PCM しか受けない。**
 * 変換は Remotion に同梱の ffmpeg にやらせる（自前でリサンプルを書いていたが、
 * 折り返し対策つきの実装を持つ必要がない。依存も増えない）。
 *
 * `extractAudio()` は使えない。あれは「再圧縮しない」抽出なので、mp4 の AAC が
 * そのまま WAV 容器に入って出てくる（audioFormat=255）。PCM として読むと
 * 尺が 1/5 に見えてテロップの時刻が全部ずれる。
 */
import { RenderInternals } from "@remotion/renderer";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { assertPcm16, decodePcm16, readWavFormat, type WavFormat } from "./wav.ts";

/** whisper.cpp が要求するサンプリングレート */
export const WHISPER_SAMPLE_RATE = 16_000;

export const extractPcmWav = async (opts: {
  videoPath: string;
  outPath: string;
  sampleRate?: number;
}): Promise<WavFormat> => {
  const sampleRate = opts.sampleRate ?? WHISPER_SAMPLE_RATE;
  if (!isAbsolute(opts.videoPath)) {
    throw new Error(`動画は絶対パスで渡す（受け取った値: ${opts.videoPath}）`);
  }
  mkdirSync(dirname(opts.outPath), { recursive: true });

  const child = RenderInternals.callFf({
    bin: "ffmpeg",
    args: [
      "-hide_banner",
      "-y",
      "-i",
      opts.videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-c:a",
      "pcm_s16le",
      opts.outPath,
    ],
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
    cancelSignal: undefined,
  });

  try {
    await child;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`音声の抽出に失敗した: ${opts.videoPath}\n${message}`);
  }

  // 「変換できたつもり」を潰す。ここを通ったものだけ認識にかける
  return assertPcm16(readWavFormat(readFileSync(opts.outPath)), {
    sampleRate,
    channels: 1,
  });
};

/**
 * 音が入っているか（実効値と最大値）。
 *
 * 認識が空で返ってくる原因のほとんどは「音声トラックが無音」。
 * 数分かけて認識してから気づくのは無駄なので、**先に見る。**
 */
export const audioLevel = (wavPath: string): { rms: number; peak: number } => {
  const samples = decodePcm16(readFileSync(wavPath));
  let sum = 0;
  let peak = 0;
  for (const sample of samples) {
    sum += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return { rms: samples.length === 0 ? 0 : Math.sqrt(sum / samples.length), peak };
};

/** これを下回ったら実質無音とみなす（-60dBFS 相当） */
export const SILENCE_RMS = 0.001;
