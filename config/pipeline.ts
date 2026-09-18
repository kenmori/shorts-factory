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
  /**
   * フックを重ねておく尺。
   *
   * **無音の静止画期間は作らない。** 動画はフレーム0からナレーションが始まり、
   * フックはその上に重なって出る（この秒数だけ）。フレーム0で読めることと
   * 「すぐ始まる」ことを両立させるため。
   */
  hookOverlaySec: number;
  /** セクション間の重なり。境界で切られないように次の見出しを前セクションに重ねる */
  sectionOverlapSec: number;
  /** セクションの末尾に足す余白。最後の音節で切り替わらないように */
  sectionTailSec: number;
  /** 視覚変化の最大間隔。これを超えると lint で落ちる */
  maxVisualStillSec: number;
  /**
   * 冒頭に許す無音の長さ。**動画は最初の2秒で決まる。**
   * ここを超えて音が始まらない動画は「まだ始まっていない画面」に見えるので
   * lint で落とす（フックは静止画として置くのではなく重ねる）
   */
  maxOpeningSilenceSec: number;
  /** ナレーションに対する BGM の音量比 */
  bgmVolume: number;
  platforms: readonly Platform[];
  voicevox: {
    endpoint: string;
    /**
     * 話者名。**番号ではなく名前で指定する。**
     * 番号（style id）は ENGINE の /speakers から引く。推測で数値を書かないため。
     */
    speakerName: string;
    /** スタイル名（「ノーマル」「熱血」など）。null なら ノーマル、無ければ先頭 */
    styleName: string | null;
    /**
     * クレジット表記。投稿テキストに機械的に差し込む。
     * ⚠️ **文言は未確認。** VOICEVOX はキャラごとに利用規約が違い、表記の要否と
     * 書式も異なる。採用キャラの規約を読んでここを直す（plan.md 9節）。
     */
    credit: string;
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
  hookOverlaySec: 1.2,
  sectionOverlapSec: 0.6,
  sectionTailSec: 0.3,
  maxVisualStillSec: 2,
  maxOpeningSilenceSec: 0.5,
  bgmVolume: 0.1,
  platforms: ["tiktok", "shorts", "reels"],
  voicevox: {
    endpoint: process.env.VOICEVOX_ENDPOINT ?? "http://127.0.0.1:50021",
    // 採用キャラの利用規約とクレジット表記は収益化前に確認する（plan.md 9節）
    speakerName: "青山龍星",
    styleName: null,
    credit: "VOICEVOX:青山龍星",
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
