/**
 * 静止画1枚。**フックの確認に動画は要らない。**
 *
 *   npm run still -- --topic <id> --at 1.5
 *
 * 「音を切って2秒で伝わるか」の検証に使う。数秒で終わるのでループが回る。
 */
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { getNumber, getString, getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { outDir } from "./lib/paths.ts";
import { platformsFromArg, renderFrame } from "./lib/render-core.ts";
import { loadTimeline } from "./lib/script-io.ts";
import { toFrames } from "../src/lib/frames.ts";

export const stillTopic = async (
  id: string,
  atSec: number,
  platformArg?: string,
): Promise<string> => {
  const timeline = loadTimeline(id);
  const platform = platformsFromArg(platformArg)[0];
  if (!platform) {
    throw new Error("媒体が決まらない");
  }
  const lastFrame = toFrames(timeline.totalDurationSec, timeline.fps) - 1;
  const frame = Math.min(Math.max(0, toFrames(atSec, timeline.fps)), lastFrame);

  const dir = outDir(id);
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `still-${platform}-${atSec}s.png`);

  log.step(`静止画: ${atSec}秒（frame ${frame} / ${platform}）`);
  await renderFrame({ topicId: id, platform, frame, outPath });
  log.ok(outPath);
  log.info("音を想像せずに見る。意味が通らなければ hook を書き直す（台本JSONだけの修正）");
  return outPath;
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  const atSec = getNumber(args, "at") ?? 1.5;
  await stillTopic(id, atSec, getString(args, "platform"));
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
