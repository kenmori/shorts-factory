/**
 * テロップと音声が合っているかを機械で見る（モードB の投稿前ゲート）。
 *
 *   npm run caption:check -- --video /Users/you/Movies/clip.mp4
 *
 * 見るのは「区間として成立しているか」と「元動画の実測と矛盾していないか」。
 * **人間が直したあとに壊れていないかを確認するのが主目的。**
 * 読みの正しさは機械では見られないので、そこは目で見る（README）。
 */
import { checkTelopChunks } from "../src/lib/telop.ts";
import { parseArgs, getString } from "./lib/args.ts";
import { exists } from "./lib/io.ts";
import { Halt, log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { mp4AvSync, readMp4, videoShape } from "./lib/mp4.ts";
import { telopOutDir, telopPath } from "./lib/paths.ts";
import { readTelop, resolveVideoPath, slugForVideo } from "./lib/telop-io.ts";
import { telopOptions } from "./caption-asr.ts";
import { join } from "node:path";

export const captionCheck = (opts: { videoPath: string }): void => {
  const slug = slugForVideo(opts.videoPath);
  if (!exists(telopPath(slug))) {
    throw new Halt("テロップがまだ無い", [
      `npm run caption:asr -- --video ${opts.videoPath}`,
    ]);
  }
  const telop = readTelop(slug);
  const shape = videoShape(readMp4(opts.videoPath));

  const failures: string[] = [];
  const check = (ok: boolean, message: string): void => {
    if (ok) {
      log.ok(message);
    } else {
      log.fail(message);
      failures.push(message);
    }
  };

  log.step("元動画");
  check(
    Math.abs(telop.videoDurationSec - shape.durationSec) < 0.05,
    `尺が一致（テロップ ${telop.videoDurationSec.toFixed(3)}秒 / 実測 ${shape.durationSec.toFixed(3)}秒）`,
  );
  check(
    telop.width === shape.width && telop.height === shape.height && telop.fps === shape.fps,
    `画面が一致（${telop.width}x${telop.height} ${telop.fps}fps / 実測 ${shape.width}x${shape.height} ${shape.fps}fps）`,
  );

  log.step("テロップの区間");
  const options = telopOptions(telop.videoDurationSec);
  const problems = checkTelopChunks(telop.chunks, options);
  if (problems.length === 0) {
    const last = telop.chunks[telop.chunks.length - 1];
    log.ok(`${telop.chunks.length}枚。重なり・はみ出し・0秒なし`);
    log.info(
      `最初 ${(telop.chunks[0]?.startMs ?? 0) / 1000}秒 / 最後 ${((last?.endMs ?? 0) / 1000).toFixed(2)}秒`,
    );
  } else {
    for (const p of problems) {
      log.fail(`${p.rule}: ${p.message}`);
      failures.push(p.message);
    }
  }
  const joined = telop.chunks.map((c) => c.text).join("");
  if (joined !== telop.transcript) {
    // 人間が直したなら当然ずれる。落とさずに知らせる
    log.info(`認識結果から手で直されている（${telop.transcript.length} → ${joined.length} 文字）`);
  }

  log.step("書き出した動画");
  const outPath = join(telopOutDir(slug), `${slug}.mp4`);
  if (!exists(outPath)) {
    log.skip(`まだレンダーしていない（npm run caption:render -- --video ${opts.videoPath}）`);
  } else {
    const info = readMp4(outPath);
    check(
      Math.abs(info.durationSec - shape.durationSec) < 0.1,
      `尺が元動画と一致（${info.durationSec.toFixed(3)}秒）`,
    );
    const sync = mp4AvSync(info);
    check(
      // 1フレーム未満なら見て分からない。基準は元動画の fps
      Math.abs(sync.videoAheadSec) < 1 / telop.fps,
      `映像と音声のズレ ${(sync.videoAheadSec * 1000).toFixed(1)}ms（1フレーム未満）`,
    );
  }

  log.blank();
  if (failures.length > 0) {
    throw new Error(`${failures.length} 件。直してから投稿する`);
  }
  log.ok("機械で見られるところは通った。読み（固有名詞）は目で確認する");
};

if (isEntry(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs();
    captionCheck({ videoPath: resolveVideoPath(getString(args, "video") ?? args.positional[0]) });
  });
}
