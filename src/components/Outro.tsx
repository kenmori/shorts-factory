/**
 * アウトロ。**最終フレームを hook のデザインに寄せて先頭に繋ぐ。**
 *
 * ループが起きると視聴完了率が100%を超える（plan.md 3.5節）。
 * だから「チャンネル登録して」のような別デザインの締めは置かない。
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_FAMILY, SPACING, VIDEO } from "../design/tokens.ts";
import { fitFontSize } from "../lib/fit.ts";
import { progressAt } from "../lib/frames.ts";
import { SafeFrame } from "./Background.tsx";
import { useShort } from "./short-context.tsx";

export const Outro: React.FC = () => {
  const { script, palette, type, safeArea } = useShort();
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const available = VIDEO.width - safeArea.left - safeArea.right;
  const text = script.outro.split("|").join("");
  const outroSize = fitFontSize({
    text,
    availableWidth: available,
    maxLines: 3,
    maxSize: type.hookSize * 0.72,
    minSize: type.hookSize * 0.42,
    fontWeight: type.hookWeight,
  });
  // 先頭に繋ぐので hook と同じ文字を出す。1行に収める
  const echoSize = fitFontSize({
    text: script.hook,
    availableWidth: available,
    maxLines: 1,
    maxSize: type.hookSize * 0.5,
    minSize: type.hookSize * 0.3,
    fontWeight: type.hookWeight,
  });
  // hook と同じ位置に同じ太さで戻す。最後の 0.6 秒でフックの文言を重ねる
  const backToHook = progressAt(frame, Math.round(fps * 0.6), Math.round(fps * 1.2));

  return (
    <AbsoluteFill
      style={{ background: `linear-gradient(160deg, ${palette.bg} 0%, ${palette.bgAlt} 100%)` }}
    >
      <SafeFrame>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: SPACING.blockGap,
          }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontWeight: type.hookWeight,
              fontSize: outroSize,
              lineHeight: type.hookLineHeight,
              letterSpacing: type.letterSpacing,
              color: palette.fg,
              wordBreak: type.wordBreak,
              lineBreak: type.lineBreak,
            }}
          >
            {text}
          </div>
          <div
            style={{
              height: SPACING.borderWidth * 2,
              width: "100%",
              background: palette.accent,
              borderRadius: SPACING.borderWidth,
            }}
          />
          <div
            style={{
              opacity: backToHook,
              fontFamily: FONT_FAMILY,
              fontWeight: type.hookWeight,
              fontSize: echoSize,
              letterSpacing: type.letterSpacing,
              color: palette.accentAlt,
              wordBreak: type.wordBreak,
              lineBreak: type.lineBreak,
            }}
          >
            {script.hook}
          </div>
        </div>
      </SafeFrame>
    </AbsoluteFill>
  );
};
