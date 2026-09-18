/**
 * テロップを焼いた動画を書き出す（モードB の2工程目）。
 *
 *   npm run caption:render -- --video /Users/you/Movies/clip.mp4 [--platform tiktok]
 *
 * 画面サイズ・fps・尺は元動画の実測。音声は元動画のものをそのまま使う。
 * `--platform` はテロップを置く位置（媒体UIを避ける余白）だけに効く。
 */
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { config, type Platform } from "../config/pipeline.ts";
import { parseArgs, getString } from "./lib/args.ts";
import { exists } from "./lib/io.ts";
import { Halt, log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { telopOutDir, telopPath } from "./lib/paths.ts";
import { renderSelected, selectById } from "./lib/render-core.ts";
import { linkSource, readTelop, resolveVideoPath, slugForVideo, writeTelopProps } from "./lib/telop-io.ts";

export const captionRender = async (opts: {
  videoPath: string;
  platform?: Platform;
}): Promise<string> => {
  const slug = slugForVideo(opts.videoPath);
  if (!exists(telopPath(slug))) {
    throw new Halt("テロップがまだ無い", [
      `npm run caption:asr -- --video ${opts.videoPath}`,
    ]);
  }
  const platform = opts.platform ?? (config.platforms[0] as Platform);
  const telop = readTelop(slug);
  // 手で直したテロップをバンドル側へ渡す。ここを忘れると古いテロップが焼かれる
  writeTelopProps(slug, telop);
  linkSource(opts.videoPath, slug);

  const dir = telopOutDir(slug);
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `${slug}.mp4`);

  log.step(`レンダー（${telop.width}x${telop.height} / ${telop.fps}fps / ${telop.chunks.length}枚）`);
  const selected = await selectById("CaptionedVideo", { slug, platform });
  let last = -1;
  await renderSelected({
    selected,
    outPath,
    onProgress: (ratio) => {
      const pct = Math.floor(ratio * 10) * 10;
      if (pct > last) {
        last = pct;
        log.info(`${pct}%`);
      }
    },
  });
  log.ok(outPath);
  return outPath;
};

if (isEntry(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs();
    const platform = getString(args, "platform");
    if (platform !== undefined && !config.platforms.includes(platform as Platform)) {
      throw new Error(`知らない媒体: ${platform}（${config.platforms.join(" / ")}）`);
    }
    await captionRender({
      videoPath: resolveVideoPath(getString(args, "video") ?? args.positional[0]),
      platform: platform as Platform | undefined,
    });
  });
}
