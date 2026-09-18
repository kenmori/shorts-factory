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

/**
 * 実測値を許容範囲に収める。**ここが文字を消しうる唯一の経路。**
 *
 * `fitText` は DOM 計測なので、計測できなかったときに NaN / Infinity / 0 を
 * 返しうる。素朴に `Math.max(min, Math.min(max, NaN))` と書くと NaN が抜けて
 * `fontSize: NaN` になり、**そのフレームだけ文字が消える**（チカチカに見える）。
 * 有限でない値・小さすぎる値は maxSize に倒す（大きすぎる方はクランプで足りる）。
 */
export const clampFontSize = (
  measured: number,
  opts: { minSize: number; maxSize: number },
): number => {
  if (!Number.isFinite(measured) || measured <= 0) {
    return opts.maxSize;
  }
  return Math.max(opts.minSize, Math.min(opts.maxSize, measured));
};

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
  return clampFontSize(fontSize, opts);
};
