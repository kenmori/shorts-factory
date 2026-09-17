/**
 * フォントはバンドルする。**ネットワーク依存にしない。**
 *
 * Google Fonts を CSS の `@import` で読むと、オフラインで落ちるだけでなく
 * 失敗時に代替フォントで無言でレンダーされる（字幕の行数が変わって全部作り直し）。
 * ここでは public/fonts/ のローカルファイルを読み、失敗したら**明示的に落とす**。
 *
 * public/fonts/ は `npm run fonts:sync`（postinstall で自動実行）が作る。
 */
import { loadFont } from "@remotion/fonts";
import { continueRender, delayRender, staticFile } from "remotion";
import { FONT_FAMILY } from "./tokens.ts";

const WEIGHTS: readonly [number, string][] = [
  [400, "noto-sans-jp-400.woff2"],
  [700, "noto-sans-jp-700.woff2"],
  [900, "noto-sans-jp-900.woff2"],
  [400, "noto-sans-jp-latin-400.woff2"],
  [700, "noto-sans-jp-latin-700.woff2"],
  [900, "noto-sans-jp-latin-900.woff2"],
];

let started = false;

/** モジュール読み込み時に1回だけ実行する */
export const ensureFonts = (): void => {
  if (started) {
    return;
  }
  started = true;
  const handle = delayRender("フォントの読み込み待ち（public/fonts/）");
  Promise.all(
    WEIGHTS.map(([weight, file]) =>
      loadFont({
        family: FONT_FAMILY,
        url: staticFile(`fonts/${file}`),
        weight: String(weight),
        style: "normal",
      }),
    ),
  )
    .then(() => continueRender(handle))
    .catch((err: unknown) => {
      // 代替フォントで無言にレンダーさせない。ここは落とすのが正しい
      throw new Error(
        `フォントの読み込みに失敗。public/fonts/ を確認する（npm run fonts:sync）: ${String(err)}`,
      );
    });
};
