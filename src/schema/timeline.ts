/**
 * タイムライン = 音声合成の**生成物**。台本（入力）とは別物なので git 管理しない。
 *
 * 字幕もセクションの尺もここから来る。テンプレは台本とこれを props で受け取る。
 *
 * 音声は1本に結合せず、セグメント（= 合成の単位）のまま並べる。
 * Remotion がレンダー時にミックスするので ffmpeg での結合工程が不要になり、
 * 内容アドレスキャッシュのファイルをそのまま使える。
 */
import { z } from "zod";

/**
 * @remotion/captions の Caption 型に合わせる。
 * 将来 Whisper ルート（単語単位）に乗り換えても描画側は変更不要。
 *
 * `pageBreakAfter` は必須級。createTikTokStyleCaptions のページ分割は
 * **半角スペース始まりのトークンを境界にする**実装なので、分かち書きしない
 * 日本語だと全チャンクが1ページに合体して画面を埋め尽くす。
 * "|" の位置をそのままページ境界として渡す。
 */
export const captionSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable(),
  confidence: z.number().nullable(),
  pageBreakAfter: z.boolean().optional(),
});

export const segmentTimingSchema = z.object({
  startSec: z.number().min(0),
  durationSec: z.number().positive(),
});

export const audioSegmentSchema = z.object({
  /** staticFile() に渡す public/ 以下の相対パス */
  src: z.string(),
  startSec: z.number().min(0),
  durationSec: z.number().positive(),
});

export const timelineSchema = z
  .object({
    id: z.string(),
    fps: z.number().positive(),
    /** "voicevox" / "elevenlabs" / "mock"。mock は publish-check が落とす */
    engine: z.string(),
    /** エンジン＋話者＋モデル。音声の再現性の記録 */
    voiceSignature: z.string(),
    audio: z.array(audioSegmentSchema),
    bgmSrc: z.string(),
    hook: segmentTimingSchema,
    sections: z.array(segmentTimingSchema).min(1),
    outro: segmentTimingSchema,
    totalDurationSec: z.number().positive(),
    /** 動画先頭を 0 とした絶対時刻 */
    captions: z.array(captionSchema),
    generatedAt: z.string(),
  })
  .strict();

export type Caption = z.infer<typeof captionSchema>;
export type SegmentTiming = z.infer<typeof segmentTimingSchema>;
export type AudioSegment = z.infer<typeof audioSegmentSchema>;
export type Timeline = z.infer<typeof timelineSchema>;

/** レンダー props。calculateMetadata が public/props/<id>.json から読む */
export const renderPropsSchema = z.object({
  topicId: z.string(),
  platform: z.enum(["tiktok", "shorts", "reels"]),
});
