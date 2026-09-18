/**
 * デザイントークン。**コンポーネント内に数値をハードコードしない**（CLAUDE.md）。
 *
 * 日本語と欧文でタイポグラフィの値が別物なので locale ごとに持たせる。
 * （行高・ウェイト・word-break / 禁則処理）
 */
import type { Locale } from "../schema/script.ts";

export const VIDEO = {
  width: 1080,
  height: 1920,
} as const;

/** フォントファミリ名は src/design/fonts.ts の loadFont と一致させる */
export const FONT_FAMILY = "Noto Sans JP";

export type Palette = {
  id: string;
  bg: string;
  bgAlt: string;
  /** 主役の文字色 */
  fg: string;
  /** 補助テキスト */
  fgMuted: string;
  /** 強調・進捗・下線 */
  accent: string;
  accentAlt: string;
  /** 字幕の背景（可読性のための帯） */
  subtitleBg: string;
};

/**
 * 3種。フォーマット疲れ対策で id のハッシュから決定的にローテートする
 * （ランダムは偏る → src/design/variants.ts）。
 */
export const PALETTES: readonly Palette[] = [
  {
    id: "ink",
    bg: "#0B0D12",
    bgAlt: "#151A24",
    fg: "#F7F9FC",
    fgMuted: "#9AA6B8",
    accent: "#4DA3FF",
    accentAlt: "#7CF5C4",
    subtitleBg: "rgba(5,7,12,0.72)",
  },
  {
    id: "amber",
    bg: "#14100A",
    bgAlt: "#221B10",
    fg: "#FFF8ED",
    fgMuted: "#BFAE93",
    accent: "#FFB23F",
    accentAlt: "#FF6A5E",
    subtitleBg: "rgba(12,9,5,0.72)",
  },
  {
    id: "violet",
    bg: "#0C0A14",
    bgAlt: "#171327",
    fg: "#F6F3FF",
    fgMuted: "#A79CC4",
    accent: "#A57BFF",
    accentAlt: "#5BE1FF",
    subtitleBg: "rgba(7,5,14,0.72)",
  },
];

export type Typography = {
  hookSize: number;
  hookLineHeight: number;
  headingSize: number;
  leadSize: number;
  subtitleSize: number;
  subtitleLineHeight: number;
  telopSize: number;
  metaSize: number;
  codeSize: number;
  /** 日本語は文字単位で折り返してよい。欧文は単語を割らない */
  wordBreak: "auto-phrase" | "keep-all" | "normal";
  lineBreak: "strict" | "auto" | "normal";
  /** 日本語は字面が大きいので詰める */
  letterSpacing: string;
  hookWeight: number;
  bodyWeight: number;
};

export const TYPOGRAPHY: Record<Locale, Typography> = {
  ja: {
    hookSize: 128,
    hookLineHeight: 1.18,
    headingSize: 64,
    leadSize: 78,
    subtitleSize: 62,
    subtitleLineHeight: 1.3,
    telopSize: 52,
    metaSize: 36,
    codeSize: 38,
    wordBreak: "auto-phrase",
    lineBreak: "strict",
    letterSpacing: "-0.02em",
    hookWeight: 900,
    bodyWeight: 700,
  },
  en: {
    hookSize: 132,
    hookLineHeight: 1.05,
    headingSize: 66,
    leadSize: 82,
    subtitleSize: 64,
    subtitleLineHeight: 1.2,
    telopSize: 54,
    metaSize: 38,
    codeSize: 40,
    wordBreak: "keep-all",
    lineBreak: "auto",
    letterSpacing: "-0.01em",
    hookWeight: 900,
    bodyWeight: 700,
  },
};

export const SPACING = {
  gutter: 72,
  blockGap: 48,
  radius: 28,
  borderWidth: 6,
} as const;

/**
 * 字幕の帯が占める高さ（2行分 + 余白）。
 *
 * 字幕は画面下の独立したレイヤーなので、セクションの内容が下まで伸びると
 * **重なる**（画像を入れた途端に起きた）。セクション側はこの分を空ける。
 */
export const subtitleBandHeight = (type: Typography): number =>
  type.subtitleSize * type.subtitleLineHeight * 2 + SPACING.gutter / 2;

/**
 * タイポグラフィを別の画面サイズへ持っていく。
 *
 * 上の数値は 1080x1920 に合わせてある。**手持ちの動画は解像度がばらばら**
 * （モードB）なので、高さの比で全部を掛ける。個別に書き換えると
 * どれが基準値なのか分からなくなる。
 */
export const scaleTypography = (type: Typography, scale: number): Typography => {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    ...type,
    hookSize: type.hookSize * s,
    headingSize: type.headingSize * s,
    leadSize: type.leadSize * s,
    subtitleSize: type.subtitleSize * s,
    telopSize: type.telopSize * s,
    metaSize: type.metaSize * s,
    codeSize: type.codeSize * s,
  };
};

export type Spacing = { [K in keyof typeof SPACING]: number };

/** 余白も同じ比で動かす */
export const scaleSpacing = (scale: number): Spacing => {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    gutter: SPACING.gutter * s,
    blockGap: SPACING.blockGap * s,
    radius: SPACING.radius * s,
    borderWidth: SPACING.borderWidth * s,
  };
};
