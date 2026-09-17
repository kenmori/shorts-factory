/**
 * テロップ。**字幕とは別系統。** 混ぜると実装が破綻する。
 *
 * - 字幕: ナレーション原稿そのもの。音声に同期。**生成物**
 * - テロップ: デザイン要素。セクション内の相対秒で十分。**入力**（台本に手で書く）
 */
import { Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { Telop as TelopData } from "../schema/script.ts";
import { FONT_FAMILY, SPACING } from "../design/tokens.ts";
import { toDurationFrames, toFrames, progressAt } from "../lib/frames.ts";
import { useShort } from "./short-context.tsx";

const TelopBody: React.FC<{ telop: TelopData }> = ({ telop }) => {
  const { palette, type } = useShort();
  const frame = useCurrentFrame();
  // 出現は速く（3フレーム）。ゆっくりフェードさせない
  const appear = progressAt(frame, 0, 3);
  const slide = (1 - appear) * 24;

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontWeight: 900,
        fontSize: type.telopSize,
        letterSpacing: type.letterSpacing,
        color: palette.bg,
        background: palette.accentAlt,
        padding: `10px ${SPACING.gutter / 3}px`,
        borderRadius: SPACING.radius / 2,
        transform: `translateY(${slide}px)`,
        opacity: appear,
        alignSelf: "flex-start",
        wordBreak: type.wordBreak,
        lineBreak: type.lineBreak,
      }}
    >
      {telop.text}
    </div>
  );
};

/** セクション内に配置する。atSec はセクション先頭からの相対秒 */
export const Telops: React.FC<{ telops: TelopData[] }> = ({ telops }) => {
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.gutter / 4 }}>
      {telops.map((telop, i) => (
        <Sequence
          key={`${telop.text}-${i}`}
          from={toFrames(telop.atSec, fps)}
          durationInFrames={toDurationFrames(telop.durationSec, fps)}
          layout="none"
        >
          <TelopBody telop={telop} />
        </Sequence>
      ))}
    </div>
  );
};
