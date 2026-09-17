/**
 * パイプラインの切替点。ここ以外に分岐を置かない。
 */

export type ScriptSource = "manual" | "api";

/**
 * "mock" は音声エンジンが用意できない環境（CI・初回セットアップ）で
 * パイプラインの配線を検証するためのもの。**投稿用の動画には使わない。**
 * publish-check が mock 由来のタイムラインを検出して落とす。
 */
export type TtsEngineId = "voicevox" | "elevenlabs" | "mock";

export type Platform = "tiktok" | "shorts" | "reels";

export type PipelineConfig = {
  /** 台本の作り方。manual = Claude Code で書く / api = script:generate が生成する */
  scriptSource: ScriptSource;
  tts: TtsEngineId;
  fps: number;
  /** 尺の許容範囲。外れる台本は lint で reject（3.5節: 完了率優先で 65〜75 秒） */
  durationRangeSec: readonly [number, number];
  /** Creator Rewards の対象条件。publish-check のハード判定に使う */
  minPublishableDurationSec: number;
  /** フック（無音で成立させる全画面テキスト）の尺。ナレーションは乗せない */
  hookDurationSec: number;
  /** セクション間の重なり。境界で切られないように次の見出しを前セクションに重ねる */
  sectionOverlapSec: number;
  /** セクションの末尾に足す余白。最後の音節で切り替わらないように */
  sectionTailSec: number;
  /** 視覚変化の最大間隔。これを超えると lint で落ちる */
  maxVisualStillSec: number;
  /** ナレーションに対する BGM の音量比 */
  bgmVolume: number;
  platforms: readonly Platform[];
  voicevox: {
    endpoint: string;
    speaker: number;
    speedScale: number;
    pitchScale: number;
    intonationScale: number;
    /** チャンク間に入れる無音（秒）。字幕の切り替わりを聞き取れる間にする */
    prePhonemeLength: number;
    postPhonemeLength: number;
  };
  elevenlabs: {
    voiceId: string;
    modelId: string;
    endpoint: string;
  };
};

export const config: PipelineConfig = {
  scriptSource: "manual",
  tts: "voicevox",
  fps: 30,
  durationRangeSec: [65, 75],
  minPublishableDurationSec: 60,
  hookDurationSec: 2,
  sectionOverlapSec: 0.6,
  sectionTailSec: 0.3,
  maxVisualStillSec: 2,
  bgmVolume: 0.1,
  platforms: ["tiktok", "shorts", "reels"],
  voicevox: {
    endpoint: process.env.VOICEVOX_ENDPOINT ?? "http://127.0.0.1:50021",
    // 採用キャラの利用規約とクレジット表記は収益化前に確認する（plan.md 9節）
    speaker: 3,
    speedScale: 1.05,
    pitchScale: 0,
    intonationScale: 1.1,
    prePhonemeLength: 0.05,
    postPhonemeLength: 0.15,
  },
  elevenlabs: {
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
    modelId: "eleven_v3",
    endpoint: "https://api.elevenlabs.io",
  },
};
