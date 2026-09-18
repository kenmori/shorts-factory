/**
 * フック。**フレーム0から全画面テキスト。フェードインなし。**
 *
 * 初回視聴の多くは無音か音が出遅れるので、hook はナレーションに乗せない
 * （乗せると読まれない）。ここが動画の成否の大半を決める（plan.md 3.5節）。
 *
 * `hookStyle` は id のハッシュから決定的にローテートする（フォーマット疲れ対策）。
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_FAMILY, SPACING, VIDEO } from "../design/tokens.ts";
import { fitFontSize } from "../lib/fit.ts";
import { progressAt } from "../lib/frames.ts";
import { DateBadge } from "./DateBadge.tsx";
import { SafeFrame } from "./Background.tsx";
import { useShort } from "./short-context.tsx";

/** 数値スタイル用。hook の先頭の数字を拾う */
const leadingNumber = (hook: string): string | null => {
  const m = /^([0-9０-９]+(?:\.[0-9]+)?[%％倍件個分秒年月日x×]?)/.exec(hook);
  return m?.[1] ?? null;
};

export const Hook: React.FC<{ variantOverride?: "question" | "number" | "negation" }> = ({
  variantOverride,
}) => {
  const { script, palette, type, variant, safeArea } = useShort();
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const style = variantOverride ?? script.hookStyle ?? variant.hookStyle;

  // 下線は「読み終わったあと」に伸びる。文字自体はフレーム0から100%見える
  const underline = progressAt(frame, Math.round(fps * 0.25), Math.round(fps * 0.9));
  const number = style === "number" ? leadingNumber(script.hook) : null;
  const body = number ? script.hook.slice(number.length) : script.hook;

  // 24文字の hook でも2行に収まるサイズにする（3行目に落ちると2秒で読み切れない）
  const hookSize = fitFontSize({
    text: body,
    availableWidth: VIDEO.width - safeArea.left - safeArea.right,
    maxLines: 2,
    maxSize: type.hookSize,
    minSize: type.hookSize * 0.55,
    fontWeight: type.hookWeight,
  });

  return (
    // 下のセクションに重なるので背景を塗る。1枚のカードとして読ませる
    <AbsoluteFill
      style={{ background: `linear-gradient(160deg, ${palette.bg} 0%, ${palette.bgAlt} 100%)` }}
    >
      <SafeFrame>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          {/* evergreen のバッジは既に製品名とバージョンを出すので重ねない */}
          {script.shelfLife === "hot" ? (
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: type.bodyWeight,
                fontSize: type.metaSize,
                color: palette.fgMuted,
                letterSpacing: type.letterSpacing,
              }}
            >
              {script.entity}
              {script.version ? ` ${script.version}` : ""}
            </div>
          ) : (
            <div />
          )}
          <DateBadge />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: SPACING.blockGap,
          }}
        >
          {number ? (
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 900,
                fontSize: hookSize * 1.6,
                lineHeight: 0.95,
                color: palette.accent,
                letterSpacing: "-0.04em",
              }}
            >
              {number}
            </div>
          ) : null}

          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontWeight: type.hookWeight,
              fontSize: hookSize,
              lineHeight: type.hookLineHeight,
              letterSpacing: type.letterSpacing,
              color: palette.fg,
              wordBreak: type.wordBreak,
              lineBreak: type.lineBreak,
              textDecoration: style === "negation" ? "line-through" : "none",
              textDecorationColor: palette.accentAlt,
              textDecorationThickness: SPACING.borderWidth,
            }}
          >
            {body}
            {style === "question" ? (
              <span style={{ color: palette.accent }}>？</span>
            ) : null}
          </div>

          <div
            style={{
              height: SPACING.borderWidth * 2,
              width: `${underline * 100}%`,
              background: palette.accent,
              borderRadius: SPACING.borderWidth,
            }}
          />
        </div>
      </SafeFrame>
    </AbsoluteFill>
  );
};
