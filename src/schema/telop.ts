/**
 * モードB（手持ちの動画にテロップを付ける）の中間ファイル。
 *
 * **これは生成物ではなく入力。** 音声認識は固有名詞を外すので、人間が直す。
 * 直したあと再認識は走らない（認識のやり直しは `--force`）。
 */
import { z } from "zod";

export const telopChunkSchema = z
  .object({
    text: z.string().min(1),
    startMs: z.number().min(0),
    endMs: z.number().min(0),
  })
  .refine((c) => c.endMs > c.startMs, {
    message: "endMs は startMs より後にする",
  });

export const telopFileSchema = z.object({
  /** 元動画の絶対パス。手で直したファイルがどの動画のものか分からなくなるのを防ぐ */
  video: z.string().min(1),
  videoDurationSec: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  locale: z.enum(["ja", "en"]),
  /** 認識に使ったもの。手打ちなら "manual" */
  engine: z.string().min(1),
  /** 認識した生テキスト。テロップを手で直したときの照合用 */
  transcript: z.string(),
  chunks: z.array(telopChunkSchema).min(1),
});

export type TelopFile = z.infer<typeof telopFileSchema>;
