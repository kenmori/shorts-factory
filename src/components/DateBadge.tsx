/**
 * 日付の扱い。**常に表示してはいけない。**
 *
 * - `hot`: 鮮度が価値そのものなので大きく出す
 * - `evergreen`: 日付は出さずバージョンだけ（3ヶ月後に古く見えるとロングテールが死ぬ）
 *
 * 表示するのは `sourceDate`（情報の日付）。`publishedAt`（投稿日）は出さない。
 */
import { FONT_FAMILY, SPACING } from "../design/tokens.ts";
import { useShort } from "./short-context.tsx";

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

export const DateBadge: React.FC = () => {
  const { script, palette, type } = useShort();

  const label =
    script.shelfLife === "hot"
      ? formatDate(script.sourceDate)
      : script.version
        ? `${script.entity} ${script.version} 時点`
        : `${script.entity} 時点`;

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontWeight: type.bodyWeight,
        fontSize: type.metaSize,
        letterSpacing: type.letterSpacing,
        color: script.shelfLife === "hot" ? palette.bg : palette.fgMuted,
        background: script.shelfLife === "hot" ? palette.accent : "transparent",
        border: script.shelfLife === "hot" ? "none" : `2px solid ${palette.fgMuted}`,
        padding: `8px ${SPACING.gutter / 4}px`,
        borderRadius: SPACING.radius / 2,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
};
