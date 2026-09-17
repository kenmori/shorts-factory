import { useCurrentFrame } from "remotion";
import { FONT_FAMILY, SPACING } from "../../design/tokens.ts";
import { progressAt } from "../../lib/frames.ts";
import { useShort } from "../short-context.tsx";

export const TextVisual: React.FC<{ lead: string }> = ({ lead }) => {
  const { palette, type } = useShort();
  const frame = useCurrentFrame();
  const bar = progressAt(frame, 2, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.gutter / 3 }}>
      <div
        style={{
          width: `${bar * 100}%`,
          height: SPACING.borderWidth,
          background: palette.accent,
          borderRadius: SPACING.borderWidth,
        }}
      />
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: type.leadSize,
          lineHeight: 1.25,
          letterSpacing: type.letterSpacing,
          color: palette.fg,
          wordBreak: type.wordBreak,
          lineBreak: type.lineBreak,
          // 台本に書いた改行をそのまま効かせる（意味の切れ目を手で決められるように）
          whiteSpace: "pre-line",
        }}
      >
        {lead}
      </div>
    </div>
  );
};
