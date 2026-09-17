/**
 * 字幕。ナレーション原稿から**生成**されたタイムスタンプで描く。
 *
 * ページ分割は @remotion/captions の createTikTokStyleCaptions に通す。
 * 将来 Whisper ルート（単語単位のトークン）に乗り換えても描画側は変更不要。
 */
import { createTikTokStyleCaptions } from "@remotion/captions";
import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_FAMILY, SPACING } from "../design/tokens.ts";
import { useShort } from "./short-context.tsx";

/**
 * 近接したトークンを1ページにまとめる上限。
 * 台本の "|" が pageBreakAfter として渡ってくるので、ここは単語単位の入力
 * （Whisper ルート）に切り替えたときにだけ効く。
 */
const COMBINE_MS = 1200;

/** ページが消えるまでの余韻。0 だと切り替わりで一瞬消えて点滅する */
const HOLD_MS = 120;

export const Subtitle: React.FC = () => {
  const { timeline, palette, type } = useShort();
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const nowMs = (frame / fps) * 1000;

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions: timeline.captions,
        combineTokensWithinMilliseconds: COMBINE_MS,
      }),
    [timeline.captions],
  );

  const page = pages.find((p) => {
    // durationMs は次のページの開始まで伸びる（無音区間も埋まる）。
    // セクションの繋ぎで前の字幕が残らないよう、実際の発話終わりで切る
    const spoken = p.tokens[p.tokens.length - 1]?.toMs ?? p.startMs + p.durationMs;
    const end = Math.min(p.startMs + p.durationMs, spoken + HOLD_MS);
    return nowMs >= p.startMs && nowMs < end;
  });
  if (!page) {
    return null;
  }

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontWeight: 900,
        fontSize: type.subtitleSize,
        lineHeight: type.subtitleLineHeight,
        letterSpacing: type.letterSpacing,
        color: palette.fg,
        background: palette.subtitleBg,
        borderRadius: SPACING.radius / 2,
        padding: `${SPACING.gutter / 4}px ${SPACING.gutter / 3}px`,
        textAlign: "center",
        wordBreak: type.wordBreak,
        lineBreak: type.lineBreak,
        textWrap: "balance",
      }}
    >
      {page.text}
    </div>
  );
};
