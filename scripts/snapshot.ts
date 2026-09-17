/**
 * スナップショット。**テンプレを触るのが怖い状態を作らないための装置。**
 *
 * テンプレは100本以上で使い回すので「セクション2を直したらフックが崩れていた」
 * という事故が起きる。動画を毎回見返すのは非現実的なので、固定フレームの PNG を
 * git に入れて差分を見る（数枚なのでリポジトリを圧迫しない）。
 *
 *   npm run snapshot -- --topic <id>          撮り直して snapshots/ を更新（git diff で確認）
 *   npm run snapshot:check -- --topic <id>    差分があれば exit 1（CI 用）
 *
 * 解像度は半分で撮る。目的は差分の検出なので等倍は要らない（容量が1/4になる）。
 */
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getString, getTopic, parseArgs } from "./lib/args.ts";
import { sha256Buffer } from "./lib/hash.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { SNAPSHOT_DIR } from "./lib/paths.ts";
import { platformsFromArg, renderFrame } from "./lib/render-core.ts";
import { loadTimeline } from "./lib/script-io.ts";
import { toFrames } from "../src/lib/frames.ts";

/** 差分検出には等倍は要らない */
const SCALE = 0.5;

/** 撮る位置。0秒・各セクションの頭・アウトロ・最終フレーム */
const frameSpecs = (id: string): { name: string; frame: number }[] => {
  const timeline = loadTimeline(id);
  const lastFrame = toFrames(timeline.totalDurationSec, timeline.fps) - 1;
  const specs = [{ name: "00-hook", frame: 0 }];
  for (const [i, section] of timeline.sections.entries()) {
    specs.push({
      name: `${String(i + 1).padStart(2, "0")}-section${i + 1}`,
      // 頭ぴったりは入場アニメの途中なので 0.4 秒後を撮る
      frame: toFrames(section.startSec + 0.4, timeline.fps),
    });
  }
  specs.push({
    name: "98-outro",
    frame: toFrames(timeline.outro.startSec + 0.4, timeline.fps),
  });
  specs.push({ name: "99-last", frame: lastFrame });
  return specs;
};

export const snapshotTopic = async (
  id: string,
  opts: { check: boolean; platformArg?: string },
): Promise<boolean> => {
  const platform = platformsFromArg(opts.platformArg)[0];
  if (!platform) {
    throw new Error("媒体が決まらない");
  }
  const committedDir = join(SNAPSHOT_DIR, id, platform);
  const targetDir = opts.check
    ? mkdtempSync(join(tmpdir(), "shorts-snapshot-"))
    : committedDir;
  mkdirSync(targetDir, { recursive: true });

  const specs = frameSpecs(id);
  log.step(`${opts.check ? "スナップショット照合" : "スナップショット更新"}: ${specs.length}枚`);

  let changed = false;
  for (const spec of specs) {
    const outPath = join(targetDir, `${spec.name}.png`);
    await renderFrame({ topicId: id, platform, frame: spec.frame, outPath, scale: SCALE });
    if (!opts.check) {
      log.ok(`${spec.name}.png`);
      continue;
    }
    const committed = join(committedDir, `${spec.name}.png`);
    if (!existsSync(committed)) {
      log.warn(`${spec.name}.png は未コミット（npm run snapshot で撮る）`);
      changed = true;
      continue;
    }
    const same =
      sha256Buffer(readFileSync(committed)) === sha256Buffer(readFileSync(outPath));
    if (same) {
      log.ok(`${spec.name}.png 一致`);
    } else {
      log.fail(`${spec.name}.png が変わっている（意図した変更か確認する）`);
      changed = true;
    }
  }

  if (!opts.check) {
    log.info("git diff で確認する。意図しない箇所が変わっていたらそれが事故");
  }
  return !changed;
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  const ok = await snapshotTopic(id, {
    check: args.flags.has("check"),
    platformArg: getString(args, "platform"),
  });
  if (!ok) {
    throw new Error("スナップショットに差分がある");
  }
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
