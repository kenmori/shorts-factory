/**
 * セクション1つ。
 *
 * 見出し・進捗・visual・テロップを置く。字幕はここには入れない
 * （セクションをまたぐので NewsDigest 側に1つだけ置く）。
 *
 * レイアウトは id のハッシュから決まる3種（フォーマット疲れ対策）。
 * セクションの**順序**は入れ替えない（payoffSection が最終セクションで
 * hook を回収する契約なので、並べ替えるとオープンループが壊れる）。
 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Section } from "../schema/script.ts";
import { FONT_FAMILY, SPACING, subtitleBandHeight } from "../design/tokens.ts";
import { progressAt } from "../lib/frames.ts";
import { SafeFrame } from "./Background.tsx";
import { Progress } from "./Progress.tsx";
import { Telops } from "./Telop.tsx";
import { useShort } from "./short-context.tsx";
import { VisualSlot } from "./visuals/index.tsx";

const Heading: React.FC<{ index: number; text: string }> = ({ index, text }) => {
  const { palette, type, variant } = useShort();

  const number = (
    <span
      style={{
        fontFamily: FONT_FAMILY,
        fontWeight: 900,
        fontSize: type.headingSize,
        color: palette.accent,
        letterSpacing: "-0.03em",
      }}
    >
      {String(index).padStart(2, "0")}
    </span>
  );

  const label = (
    <span
      style={{
        fontFamily: FONT_FAMILY,
        fontWeight: 900,
        fontSize: type.headingSize,
        letterSpacing: type.letterSpacing,
        color: variant.layout === "band" ? palette.bg : palette.fg,
        wordBreak: type.wordBreak,
        lineBreak: type.lineBreak,
      }}
    >
      {text}
    </span>
  );

  if (variant.layout === "band") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: SPACING.gutter / 3,
          background: palette.accent,
          padding: `${SPACING.gutter / 5}px ${SPACING.gutter / 3}px`,
          borderRadius: SPACING.radius / 2,
        }}
      >
        <span style={{ color: palette.bg, fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: type.headingSize }}>
          {String(index).padStart(2, "0")}
        </span>
        {label}
      </div>
    );
  }

  if (variant.layout === "split") {
    return (
      <div style={{ display: "flex", gap: SPACING.gutter / 3, alignItems: "stretch" }}>
        <div style={{ width: SPACING.borderWidth, background: palette.accent, borderRadius: 4 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {number}
          {label}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: SPACING.gutter / 3 }}>
      {number}
      {label}
    </div>
  );
};

export const SectionCard: React.FC<{
  index: number;
  section: Section;
  /** 直前のセクションに重ねて出てくるフレーム数。境界で切れ目を作らないため */
  enterFrames: number;
}> = ({ index, section, enterFrames }) => {
  const { palette, type } = useShort();
  const frame = useCurrentFrame();
  const enter = progressAt(frame, 0, Math.max(1, enterFrames));

  return (
    <AbsoluteFill
      style={{
        // 前のセクションの上に重なって入ってくる。背景を塗って下を隠す
        background: `linear-gradient(160deg, ${palette.bg} 0%, ${palette.bgAlt} 100%)`,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 48}px)`,
      }}
    >
      {/* 字幕の帯の分を空ける。空けないと画像やテロップが字幕と重なる */}
      <SafeFrame reserveBottom={subtitleBandHeight(type)}>
        <Heading index={index} text={section.heading} />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: SPACING.blockGap,
          }}
        >
          <VisualSlot visual={section.visual} sectionIndex={index} />
          <Telops telops={section.telop} />
        </div>
        <Progress current={index} />
      </SafeFrame>
    </AbsoluteFill>
  );
};
