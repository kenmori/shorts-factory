import { AbsoluteFill } from "remotion";
import { useShort } from "./short-context.tsx";
import { SPACING } from "../design/tokens.ts";

/** 背景。**フェードインは入れない**（0.5秒のフェードは2秒の窓の25%を捨てている） */
export const Background: React.FC = () => {
  const { palette } = useShort();
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${palette.bg} 0%, ${palette.bgAlt} 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          borderTop: `${SPACING.borderWidth}px solid ${palette.accent}`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * セーフエリアの内側に content を置く枠。
 * `reserveBottom` は字幕の帯のために追加で空ける高さ（セクションで使う）。
 */
export const SafeFrame: React.FC<{ children: React.ReactNode; reserveBottom?: number }> = ({
  children,
  reserveBottom = 0,
}) => {
  const { safeArea } = useShort();
  return (
    <AbsoluteFill
      style={{
        paddingTop: safeArea.top,
        paddingBottom: safeArea.bottom + reserveBottom,
        paddingLeft: safeArea.left,
        paddingRight: safeArea.right,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
