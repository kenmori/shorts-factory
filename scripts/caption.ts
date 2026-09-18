/**
 * モードB を通しで回す。
 *
 *   npm run caption -- --video /Users/you/Movies/clip.mp4
 *
 * 認識 → レンダー → 検証。認識済みなら認識は飛ばす（人間の修正を消さないため）。
 * **固有名詞を直したいときは `content/telops/<slug>.json` を直してもう一度叩く。**
 */
import { config, type Platform } from "../config/pipeline.ts";
import { parseArgs, getString } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { resolveVideoPath } from "./lib/telop-io.ts";
import { captionAsr } from "./caption-asr.ts";
import { captionCheck } from "./caption-check.ts";
import { captionRender } from "./caption-render.ts";

export const caption = async (opts: {
  videoPath: string;
  platform?: Platform;
  force?: boolean;
}): Promise<void> => {
  await captionAsr({ videoPath: opts.videoPath, force: opts.force });
  await captionRender({ videoPath: opts.videoPath, platform: opts.platform });
  log.blank();
  captionCheck({ videoPath: opts.videoPath });
};

if (isEntry(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs();
    const platform = getString(args, "platform");
    if (platform !== undefined && !config.platforms.includes(platform as Platform)) {
      throw new Error(`知らない媒体: ${platform}（${config.platforms.join(" / ")}）`);
    }
    await caption({
      videoPath: resolveVideoPath(getString(args, "video") ?? args.positional[0]),
      platform: platform as Platform | undefined,
      force: args.flags.has("force"),
    });
  });
}
