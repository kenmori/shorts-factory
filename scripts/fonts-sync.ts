/**
 * @fontsource の woff2 を public/fonts/ にコピーする。
 *
 * レンダーをネットワークから切り離すための工程。Google Fonts を CSS の
 * `@import` で読むと、オフラインで落ちるだけでなく、失敗時に代替フォントで
 * 無言でレンダーされる（= 字幕の行数が変わって全部作り直し）。
 * postinstall で自動実行される。
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { PUBLIC_FONT_DIR } from "./lib/paths.ts";

const require = createRequire(import.meta.url);

/** [@fontsource 内のファイル名, public/fonts/ での名前] */
const FILES: readonly [string, string][] = [
  ["noto-sans-jp-japanese-400-normal.woff2", "noto-sans-jp-400.woff2"],
  ["noto-sans-jp-japanese-700-normal.woff2", "noto-sans-jp-700.woff2"],
  ["noto-sans-jp-japanese-900-normal.woff2", "noto-sans-jp-900.woff2"],
  ["noto-sans-jp-latin-400-normal.woff2", "noto-sans-jp-latin-400.woff2"],
  ["noto-sans-jp-latin-700-normal.woff2", "noto-sans-jp-latin-700.woff2"],
  ["noto-sans-jp-latin-900-normal.woff2", "noto-sans-jp-latin-900.woff2"],
];

const main = (): void => {
  let pkgDir: string;
  try {
    pkgDir = dirname(require.resolve("@fontsource/noto-sans-jp/package.json"));
  } catch {
    console.error("[fonts] @fontsource/noto-sans-jp が見つかりません。npm install を先に実行してください。");
    process.exit(1);
  }

  mkdirSync(PUBLIC_FONT_DIR, { recursive: true });

  for (const [src, dest] of FILES) {
    const from = join(pkgDir, "files", src);
    if (!existsSync(from)) {
      console.error(`[fonts] ${from} が無い。@fontsource のバージョンを確認する`);
      process.exit(1);
    }
    copyFileSync(from, join(PUBLIC_FONT_DIR, dest));
  }
  console.log(`[fonts] ${FILES.length} ファイルを public/fonts/ に配置`);
};

main();
