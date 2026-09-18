/**
 * フレームの安定性を機械で確かめる。**文字が1フレームでも消えていないか。**
 *
 *   npm run check:frames -- --topic <id>           フック区間を1フレームずつ
 *   npm run check:frames -- --topic <id> --all     全編を0.5秒ごと（遅い）
 *
 * なぜ要るか: フックは無音の2秒で読ませる1枚なので、**1フレームでも
 * 文字が消えると「チカチカする」動画になる。** レンダーは決定的だが、
 * フォント計測（fitText）が失敗したフレームだけ fontSize が壊れるといった
 * 事故は起こりうる。目で見ても数フレームの欠落は分からないので機械で見る。
 *
 * 判定は「明るいピクセルの割合」。暗い背景に明るい文字なので、
 * 文字が消えればこの比率が落ちる。
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getString, getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { brightPixelRatio, decodePng } from "./lib/png.ts";
import { platformsFromArg, renderFrame } from "./lib/render-core.ts";
import { loadTimeline } from "./lib/script-io.ts";
import { toFrames } from "../src/lib/frames.ts";

/** 小さくても比率は変わらない。速さを優先する */
const SCALE = 0.25;

/** 文字が出ているとみなす最低の明るいピクセル比率 */
export const MIN_BRIGHT_RATIO = 0.005;

/** 中央値からこれ以上落ちたら「その瞬間だけ消えた」とみなす */
export const MIN_RELATIVE_TO_MEDIAN = 0.6;

export type FrameSample = { frame: number; ratio: number };

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
};

/** 落ち込んでいるフレームを返す。空なら安定している */
export const findDropouts = (samples: FrameSample[]): FrameSample[] => {
  if (samples.length === 0) {
    return [];
  }
  const mid = median(samples.map((s) => s.ratio));
  return samples.filter(
    (s) => s.ratio < MIN_BRIGHT_RATIO || s.ratio < mid * MIN_RELATIVE_TO_MEDIAN,
  );
};

export const checkFrames = async (
  id: string,
  opts: { all?: boolean; platformArg?: string } = {},
): Promise<boolean> => {
  const timeline = loadTimeline(id);
  const platform = platformsFromArg(opts.platformArg)[0];
  if (!platform) {
    throw new Error("媒体が決まらない");
  }

  const hookFrames = toFrames(timeline.hook.durationSec, timeline.fps);
  const lastFrame = toFrames(timeline.totalDurationSec, timeline.fps) - 1;

  // フックは1フレームずつ（ここが無音で読ませる区間）。
  // --all のときは残りも 0.5 秒ごとに見る
  const targets = Array.from({ length: hookFrames }, (_, i) => i);
  if (opts.all === true) {
    const step = Math.round(timeline.fps / 2);
    for (let f = hookFrames; f <= lastFrame; f += step) {
      targets.push(f);
    }
  }

  log.step(`フレームの安定性: ${targets.length}フレーム（${platform}）`);
  const dir = mkdtempSync(join(tmpdir(), "shorts-frames-"));
  const samples: FrameSample[] = [];

  for (const frame of targets) {
    const outPath = join(dir, `f${String(frame).padStart(4, "0")}.png`);
    await renderFrame({ topicId: id, platform, frame, outPath, scale: SCALE });
    const ratio = brightPixelRatio(decodePng(readFileSync(outPath)));
    samples.push({ frame, ratio });
  }

  const ratios = samples.map((s) => s.ratio);
  const mid = median(ratios);
  log.info(
    `明るいピクセル比率: 中央値 ${(mid * 100).toFixed(2)}% / ` +
      `最小 ${(Math.min(...ratios) * 100).toFixed(2)}% / 最大 ${(Math.max(...ratios) * 100).toFixed(2)}%`,
  );

  const dropouts = findDropouts(samples);
  if (dropouts.length > 0) {
    for (const d of dropouts) {
      log.fail(
        `frame ${d.frame}（${(d.frame / timeline.fps).toFixed(2)}秒）で文字が消えている` +
          `（${(d.ratio * 100).toFixed(2)}% / 中央値の ${((d.ratio / mid) * 100).toFixed(0)}%）`,
      );
    }
    log.info(`書き出したフレーム: ${dir}`);
    return false;
  }

  log.ok("全フレームで文字が出ている（欠落なし）");
  return true;
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  const ok = await checkFrames(id, {
    all: args.flags.has("all"),
    ...(getString(args, "platform") ? { platformArg: getString(args, "platform") } : {}),
  });
  if (!ok) {
    throw new Error("フレームに欠落がある");
  }
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
