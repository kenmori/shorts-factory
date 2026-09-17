/**
 * 媒体別セーフマージン（px / 1080x1920 基準）。
 *
 * ⚠️ **ここの数値は未検証のプレースホルダ。**
 * plan.md の指示どおり「実機確認した値だけを入れる」を守るため、
 * 実測するまで `verified: false` を立ててある。publish-check が人間向けの
 * チェック項目として毎回出す。実機（iPhone）で UI に文字が被っていないことを
 * 確認したら、その値に差し替えて `verified: true` にする。
 *
 * 確認手順は README「2. 確認する」のテロップの被りの行。
 */
import type { Platform } from "../../config/pipeline.ts";

export type SafeArea = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** 実機で確認した値かどうか。false のままなら投稿前ゲートで人間に出す */
  verified: boolean;
  /** 何のUIを避けているかを残す。数値の根拠が消えると直せなくなる */
  note: string;
};

export const SAFE_AREA: Record<Platform, SafeArea> = {
  tiktok: {
    top: 180,
    bottom: 520,
    left: 60,
    right: 240,
    verified: false,
    note: "右側の縦アイコン列とキャプション行。未実測",
  },
  shorts: {
    top: 160,
    bottom: 420,
    left: 60,
    right: 200,
    verified: false,
    note: "下部のタイトル2行とチャンネル行。未実測",
  },
  reels: {
    top: 200,
    bottom: 560,
    left: 60,
    right: 220,
    verified: false,
    note: "下部キャプションと右側アクション列。Reels が一番下が深い。未実測",
  },
};

export const allSafeAreasVerified = (): boolean =>
  Object.values(SAFE_AREA).every((a) => a.verified);

export const unverifiedPlatforms = (): string[] =>
  Object.entries(SAFE_AREA)
    .filter(([, a]) => !a.verified)
    .map(([p]) => p);
