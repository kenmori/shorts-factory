import { useCurrentFrame, useVideoConfig } from "remotion";
import type { ChartData } from "../../schema/script.ts";
import { FONT_FAMILY, SPACING } from "../../design/tokens.ts";
import { progressAt } from "../../lib/frames.ts";
import { useShort } from "../short-context.tsx";

/** 横棒。0.6秒で伸ばす（動きがないと視覚変化の間隔の lint に引っかかる） */
export const ChartVisual: React.FC<{ data: ChartData }> = ({ data }) => {
  const { palette, type } = useShort();
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const grow = progressAt(frame, 2, Math.round(fps * 0.6));
  const max = Math.max(...data.bars.map((b) => Math.abs(b.value)), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.gutter / 3 }}>
      {data.bars.map((bar, i) => (
        <div key={bar.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: FONT_FAMILY,
              fontWeight: type.bodyWeight,
              fontSize: type.metaSize,
              color: palette.fgMuted,
              letterSpacing: type.letterSpacing,
            }}
          >
            <span>{bar.label}</span>
            <span style={{ color: palette.fg }}>
              {bar.value}
              {data.unit}
            </span>
          </div>
          <div
            style={{
              height: type.metaSize * 1.2,
              borderRadius: SPACING.radius / 3,
              background: `${palette.fgMuted}33`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(Math.abs(bar.value) / max) * 100 * grow}%`,
                height: "100%",
                background: i === 0 ? palette.accent : palette.accentAlt,
                borderRadius: SPACING.radius / 3,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
