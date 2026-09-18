/**
 * 字幕・テロップの見た目。**描画の一次ソースはここだけ。**
 *
 * モードA（台本から作る）とモードB（手持ちの動画に付ける）で同じものを使う。
 * 別々に書くと、片方を直したときにもう片方が置いていかれる。
 */
import { FONT_FAMILY, type Palette, type Spacing, type Typography } from "../design/tokens.ts";

export const SubtitleBox: React.FC<{
  text: string;
  type: Typography;
  palette: Palette;
  spacing: Spacing;
  /** 日本語の禁則処理は lang が無いと効かない */
  locale: string;
}> = ({ text, type, palette, spacing, locale }) => (
  <div
    lang={locale}
    style={{
      fontFamily: FONT_FAMILY,
      fontWeight: 900,
      fontSize: type.subtitleSize,
      lineHeight: type.subtitleLineHeight,
      letterSpacing: type.letterSpacing,
      color: palette.fg,
      background: palette.subtitleBg,
      borderRadius: spacing.radius / 2,
      padding: `${spacing.gutter / 4}px ${spacing.gutter / 3}px`,
      textAlign: "center",
      wordBreak: type.wordBreak,
      lineBreak: type.lineBreak,
      textWrap: "balance",
    }}
  >
    {text}
  </div>
);
