/**
 * Remotion CLI（`npm run dev` = Studio）の設定。
 * レンダーは scripts/render.ts が @remotion/renderer を直接呼ぶので、
 * ここの設定は Studio と CLI 経由の操作にだけ効く。
 */
import { Config } from "@remotion/cli/config";
import { findBrowser } from "./scripts/lib/browser.ts";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");

const browser = findBrowser();
if (browser.executable) {
  Config.setBrowserExecutable(browser.executable);
  Config.setChromeMode(browser.chromeMode);
}
