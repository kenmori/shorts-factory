import { useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_FAMILY, SPACING } from "../../design/tokens.ts";
import { progressAt } from "../../lib/frames.ts";
import { useShort } from "../short-context.tsx";

const MONO = `"SFMono-Regular", Menlo, Consolas, monospace`;

const Block: React.FC<{
  label: string;
  code: string;
  tint: string;
  visible: number;
}> = ({ label, code, tint, visible }) => {
  const { palette, type } = useShort();
  return (
    <div
      style={{
        opacity: visible,
        transform: `translateY(${(1 - visible) * 16}px)`,
        border: `2px solid ${tint}`,
        borderRadius: SPACING.radius / 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: type.bodyWeight,
          fontSize: type.metaSize * 0.8,
          color: palette.bg,
          background: tint,
          padding: `4px ${SPACING.gutter / 4}px`,
        }}
      >
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: SPACING.gutter / 4,
          fontFamily: MONO,
          fontSize: type.codeSize,
          lineHeight: 1.45,
          color: palette.fg,
          background: `${palette.bg}CC`,
          whiteSpace: "pre-wrap",
        }}
      >
        {code}
      </pre>
    </div>
  );
};

/** before → after。after は 0.5秒後に出す（2つの視覚変化になる） */
export const CodeVisual: React.FC<{ before: string; after: string; lang: string }> = ({
  before,
  after,
}) => {
  const { palette } = useShort();
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.gutter / 4 }}>
      <Block label="before" code={before} tint={palette.fgMuted} visible={progressAt(frame, 0, 3)} />
      <Block
        label="after"
        code={after}
        tint={palette.accentAlt}
        visible={progressAt(frame, Math.round(fps * 0.5), Math.round(fps * 0.5) + 4)}
      />
    </div>
  );
};
