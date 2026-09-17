/**
 * 文字数に応じてフォントサイズを決める。
 *
 * 台本の hook は24文字まで許しているので、固定サイズだと長い hook が
 * 4行になって**フックが読み終わる前に2秒が終わる。** 実測で詰める。
 *
 * @remotion/layout-utils の fitText は「1行に収める」サイズを返すので、
 * 許容行数分の幅を渡して近似する（レンダー時に実測されるので推測ではない）。
 */
import { fitText } from "@remotion/layout-utils";
import { FONT_FAMILY } from "../design/tokens.ts";

export const fitFontSize = (opts: {
  text: string;
  availableWidth: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  fontWeight: number;
}): number => {
  const { fontSize } = fitText({
    text: opts.text,
    withinWidth: opts.availableWidth * opts.maxLines * 0.92,
    fontFamily: FONT_FAMILY,
    fontWeight: String(opts.fontWeight),
  });
  return Math.max(opts.minSize, Math.min(opts.maxSize, fontSize));
};
