/**
 * レンダーに使う Chromium。
 *
 * 環境にすでに Chromium があるならそれを使う（Remotion の自動ダウンロードを避ける）。
 * 見つからなければ null を返して Remotion に任せる。
 *
 * 通常の Chrome バイナリは旧 headless モードを持っていないので、
 * `chromeMode` を合わせて返す。ここがズレると起動に失敗する。
 */
import { existsSync, globSync } from "node:fs";

export type ChromeMode = "headless-shell" | "chrome-for-testing";

export type BrowserChoice = {
  executable: string | null;
  chromeMode: ChromeMode;
};

const CANDIDATES: (string | undefined)[] = [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  ...globSync("/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell"),
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
];

export const findBrowser = (): BrowserChoice => {
  for (const path of CANDIDATES) {
    if (path && existsSync(path)) {
      return {
        executable: path,
        chromeMode: path.includes("headless_shell") ? "headless-shell" : "chrome-for-testing",
      };
    }
  }
  return { executable: null, chromeMode: "headless-shell" };
};
