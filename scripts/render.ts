/**
 * レンダー。**同一マスターから3媒体分を1コマンドで書き出す。**
 *
 *   npm run render -- --topic <id>                 3媒体
 *   npm run render -- --topic <id> --platform tiktok
 *   npm run render -- --topic <id> --section 2     セクション2だけ（部分レンダー）
 *
 * 部分レンダーはフレーム範囲を timeline から計算する。1セクションだけ直したのに
 * 全部レンダーするのが一番の時間の無駄。
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Platform } from "../config/pipeline.ts";
import { getNumber, getString, getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { outDir } from "./lib/paths.ts";
import { platformsFromArg, renderVideo } from "./lib/render-core.ts";
import { loadTimeline } from "./lib/script-io.ts";
import { toFrames } from "../src/lib/frames.ts";

export type RenderOptions = {
  platforms?: Platform[];
  /** 1始まりのセクション番号。指定するとその区間だけ書き出す */
  section?: number;
};

/** セクション番号 → フレーム範囲。境界の重なり分は前に伸ばす（確認したいのは繋ぎ目） */
const sectionRange = (id: string, section: number): [number, number] => {
  const timeline = loadTimeline(id);
  const timing = timeline.sections[section - 1];
  if (!timing) {
    throw new Error(
      `セクション ${section} が無い（この台本は ${timeline.sections.length} セクション）`,
    );
  }
  const from = Math.max(0, toFrames(timing.startSec, timeline.fps) - 1);
  const to = Math.min(
    toFrames(timeline.totalDurationSec, timeline.fps) - 1,
    toFrames(timing.startSec + timing.durationSec, timeline.fps),
  );
  return [from, to];
};

export const renderTopic = async (id: string, options: RenderOptions = {}): Promise<string[]> => {
  const platforms = options.platforms ?? platformsFromArg(undefined);
  const dir = outDir(id);
  mkdirSync(dir, { recursive: true });

  const frameRange = options.section === undefined ? undefined : sectionRange(id, options.section);
  const written: string[] = [];

  for (const platform of platforms) {
    const name =
      options.section === undefined
        ? `${platform}.mp4`
        : `${platform}-section${options.section}.mp4`;
    const outPath = join(dir, name);
    log.step(`レンダー: ${platform}${frameRange ? ` [${frameRange[0]}-${frameRange[1]}]` : ""}`);
    let lastShown = -1;
    await renderVideo({
      topicId: id,
      platform,
      outPath,
      frameRange,
      onProgress: (ratio) => {
        const pct = Math.floor(ratio * 10) * 10;
        if (pct > lastShown) {
          lastShown = pct;
          log.info(`${pct}%`);
        }
      },
    });
    log.ok(outPath);
    written.push(outPath);
  }
  return written;
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  await renderTopic(id, {
    platforms: platformsFromArg(getString(args, "platform")),
    section: getNumber(args, "section"),
  });
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
