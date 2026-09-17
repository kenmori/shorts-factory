/**
 * 進捗表示。「3つのうち2つ目」が見えると終わりが近いと分かり離脱が減る（plan.md 3.5節）。
 */
import { FONT_FAMILY, SPACING } from "../design/tokens.ts";
import { useShort } from "./short-context.tsx";

export const Progress: React.FC<{ current: number }> = ({ current }) => {
  const { script, palette, type } = useShort();
  const total = script.sections.length;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: SPACING.gutter / 3 }}>
      <div style={{ display: "flex", gap: SPACING.gutter / 6, flex: 1 }}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: SPACING.borderWidth * 1.5,
              borderRadius: SPACING.borderWidth,
              background: i < current ? palette.accent : palette.fgMuted,
              opacity: i < current ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: type.bodyWeight,
          fontSize: type.metaSize,
          color: palette.fgMuted,
          letterSpacing: type.letterSpacing,
          whiteSpace: "nowrap",
        }}
      >
        {current} / {total}
      </div>
    </div>
  );
};
