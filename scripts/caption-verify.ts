/**
 * モードBの工程を「答えが分かっている素材」で測る。
 *
 *   npm run caption:verify -- --topic <id> [--platform tiktok]
 *
 * 素材は**自前で作った動画**（モードA）。字幕の時刻は音声合成が返した
 * 音声長そのものなので、答えとして使える。そこへモードBの工程
 * （音声抽出 → 認識 → テロップ化）を丸ごと通し、文字ごとの時刻を突き合わせる。
 *
 * 出るのは2つ:
 *   - 一致率  … 認識の精度。低いと固有名詞を手で直す量が増える
 *   - 時刻差  … 音とテロップのズレ。**中央値が系統的な遅れ、p95 がばらつき**
 *
 * 認識そのもののテストはユニットテストでは書けない（モデルが要る）ので、
 * 数値を残すのはここだけ。
 */
import { join } from "node:path";
import { config, type Platform } from "../config/pipeline.ts";
import { alignmentReport, type Span } from "../src/lib/telop-align.ts";
import { toTelopChunks } from "../src/lib/telop.ts";
import { extractPcmWav } from "./lib/audio-extract.ts";
import { transcribeWav, whisperReady, WHISPER_DIR } from "./lib/asr.ts";
import { parseArgs, getString, getTopic } from "./lib/args.ts";
import { exists, parseOrThrow, readJson } from "./lib/io.ts";
import { Halt, log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { readMp4, videoShape } from "./lib/mp4.ts";
import { outDir, timelinePath, WORK_DIR } from "./lib/paths.ts";
import { timelineSchema } from "../src/schema/timeline.ts";
import { telopOptions } from "./caption-asr.ts";

/** 期待する水準。ここを下回ったら工程のどこかが壊れている */
export const VERIFY_LIMITS = {
  /** 文字の一致率 */
  minMatchRate: 0.7,
  /** 系統的なズレ（中央値の絶対値, ms）。ここが大きいと全編がずれて見える */
  maxMedianOffsetMs: 300,
  /** ばらつき（p95, ms） */
  maxP95AbsOffsetMs: 900,
};

export const captionVerify = async (opts: {
  topicId: string;
  platform?: Platform;
}): Promise<void> => {
  const platform = opts.platform ?? (config.platforms[0] as Platform);
  const videoPath = join(outDir(opts.topicId), `${platform}.mp4`);
  if (!exists(timelinePath(opts.topicId)) || !exists(videoPath)) {
    throw new Halt("答え合わせの素材が無い（自前で作った動画とそのタイムライン）", [
      `npm run today`,
      `または npm run synthesize -- --topic ${opts.topicId} && npm run render -- --topic ${opts.topicId}`,
    ]);
  }
  if (!whisperReady()) {
    throw new Halt("whisper.cpp がまだ無い（初回はネットワークが必要）", [
      `npm run caption:asr -- --video ${videoPath}`,
      `用意される場所: ${WHISPER_DIR}`,
    ]);
  }

  const timeline = parseOrThrow(
    timelineSchema,
    readJson(timelinePath(opts.topicId)),
    `content/timeline/${opts.topicId}.json`,
  );
  // 答え: 字幕チャンクの区間そのもの（音声セグメントと同一）
  const truth: Span[] = timeline.captions.map((c) => ({
    text: c.text,
    startMs: c.startMs,
    endMs: c.endMs,
  }));

  const shape = videoShape(readMp4(videoPath));
  log.step(`素材（${opts.topicId} / ${platform}）`);
  log.info(`${shape.durationSec.toFixed(3)}秒 / 答えの字幕 ${truth.length}枚`);

  log.step("モードBの工程を通す");
  const wavPath = join(WORK_DIR, opts.topicId, "verify-16k.wav");
  const fmt = await extractPcmWav({ videoPath, outPath: wavPath });
  const asr = await transcribeWav(wavPath);
  const chunks = toTelopChunks(asr.tokens, telopOptions(fmt.durationSec));
  log.info(`テロップ ${chunks.length}枚 / ${asr.text.length} 文字`);

  const report = alignmentReport(truth, chunks);
  log.step("突き合わせ");
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  log.info(`一致率            ${pct(report.matchRate)}（${report.matched} / ${report.truthChars} 文字）`);
  log.info(`時刻差の中央値    ${report.medianOffsetMs.toFixed(0)}ms（正ならテロップが遅い）`);
  log.info(`ズレの中央値      ${report.medianAbsOffsetMs.toFixed(0)}ms`);
  log.info(`ズレの p95        ${report.p95AbsOffsetMs.toFixed(0)}ms`);

  const failures: string[] = [];
  if (report.matchRate < VERIFY_LIMITS.minMatchRate) {
    failures.push(
      `一致率が ${pct(report.matchRate)}（下限 ${pct(VERIFY_LIMITS.minMatchRate)}）。` +
        `モデルを大きくする: config/pipeline.ts の caption.model（現在 ${config.caption.model}）`,
    );
  }
  if (Math.abs(report.medianOffsetMs) > VERIFY_LIMITS.maxMedianOffsetMs) {
    failures.push(
      `系統的に ${report.medianOffsetMs.toFixed(0)}ms ずれている（上限 ${VERIFY_LIMITS.maxMedianOffsetMs}ms）。` +
        "音声抽出かトークンの時刻の取り方を疑う",
    );
  }
  if (report.p95AbsOffsetMs > VERIFY_LIMITS.maxP95AbsOffsetMs) {
    failures.push(
      `ズレの p95 が ${report.p95AbsOffsetMs.toFixed(0)}ms（上限 ${VERIFY_LIMITS.maxP95AbsOffsetMs}ms）`,
    );
  }

  log.blank();
  if (failures.length > 0) {
    for (const f of failures) {
      log.fail(f);
    }
    throw new Error(`${failures.length} 件。モードBのテロップは信用できない`);
  }
  log.ok("音とテロップが合っている（自前の動画で実測）");
};

if (isEntry(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs();
    const topicId = getTopic(args);
    if (!topicId) {
      throw new Error("--topic <id> を渡す（自前で作った動画を素材にする）");
    }
    const platform = getString(args, "platform");
    if (platform !== undefined && !config.platforms.includes(platform as Platform)) {
      throw new Error(`知らない媒体: ${platform}（${config.platforms.join(" / ")}）`);
    }
    await captionVerify({ topicId, platform: platform as Platform | undefined });
  });
}
