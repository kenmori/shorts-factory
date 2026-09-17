/**
 * 投稿テキストの素材。**LLM は使わない。**
 *
 * 台本1本から機械的に組む（CLAUDE.md「LLM を呼ぶコードは script:generate の中だけ」）。
 * 日付・URL は facts / sources から差し込むので生成の対象外。
 */
import type { Platform } from "./pipeline.ts";

/** 媒体ごとの固定タグ。ここに入れるのは毎回付けるものだけ */
export const BASE_HASHTAGS: Record<Platform, readonly string[]> = {
  tiktok: ["#AI", "#AIツール", "#プログラミング"],
  shorts: ["#Shorts", "#AI", "#開発"],
  reels: ["#AI", "#AIツール", "#エンジニア"],
};

/** format ごとに足すタグ */
export const FORMAT_HASHTAGS: Record<string, readonly string[]> = {
  "news-digest": ["#技術ニュース"],
  "tool-demo": ["#開発ツール"],
  "code-diff": ["#コード"],
  "data-viz": ["#データ"],
};

/** AI生成の申告。媒体側のラベル（AIGC）とは別に本文にも書く */
export const AIGC_NOTE = "この動画はAI（音声合成・生成AI）を使って制作しています。";

export const MAX_SHORTS_TITLE = 100;
