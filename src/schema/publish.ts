/**
 * 投稿テキスト。媒体ごとに別物。
 *
 * - TikTok に description は存在しない（キャプションのみ）
 * - YouTube Shorts だけが title と description を別に持つ。**検索流入の入口**。
 *   ソースURLもここに置く
 */
import { z } from "zod";

const hashtags = z.array(z.string().regex(/^#[^\s#]+$/)).min(1);

export const publishSchema = z
  .object({
    id: z.string(),
    tiktok: z.object({ caption: z.string().min(1), hashtags }),
    shorts: z.object({
      title: z.string().min(1).max(100),
      description: z.string().min(1),
      hashtags,
    }),
    reels: z.object({ caption: z.string().min(1), hashtags }),
  })
  .strict();

export type Publish = z.infer<typeof publishSchema>;
