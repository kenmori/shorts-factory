/**
 * 動画 → 音声認識 → テロップ（モードB の1工程目）。
 *
 *   npm run caption:asr -- --video /Users/you/Movies/clip.mp4 [--force]
 *
 * 出力は `content/telops/<slug>.json`。**これは人間が直す前提のファイル。**
 * 固有名詞は認識が外すので、直してから `npm run caption:render` を回す。
 * 直したあとに認識が勝手に走ってせっかくの修正を消さないよう、
 * すでにファイルがあれば `--force` が無い限り認識しない。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config/pipeline.ts";
import { toTelopChunks, checkTelopChunks, type TelopOptions } from "../src/lib/telop.ts";
import type { TelopFile } from "../src/schema/telop.ts";
import { audioLevel, extractPcmWav, SILENCE_RMS } from "./lib/audio-extract.ts";
import { transcribeWav } from "./lib/asr.ts";
import { parseArgs, getString } from "./lib/args.ts";
import { exists } from "./lib/io.ts";
import { Halt, log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { readMp4, videoShape } from "./lib/mp4.ts";
import { telopAsrPath, telopPath, telopWavPath } from "./lib/paths.ts";
import {
  linkSource,
  readTelop,
  resolveVideoPath,
  slugForVideo,
  writeTelop,
  writeTelopProps,
} from "./lib/telop-io.ts";

export const telopOptions = (audioDurationSec: number): TelopOptions => ({
  maxChars: config.caption.maxChars,
  maxDurationMs: config.caption.maxTelopSec * 1000,
  minDurationMs: config.caption.minTelopSec * 1000,
  audioDurationMs: audioDurationSec * 1000,
});

export const captionAsr = async (opts: {
  videoPath: string;
  force?: boolean;
}): Promise<{ slug: string; telop: TelopFile }> => {
  const slug = slugForVideo(opts.videoPath);

  log.step(`動画を読む（${slug}）`);
  const shape = videoShape(readMp4(opts.videoPath));
  log.info(`${shape.width}x${shape.height} / ${shape.fps}fps / ${shape.durationSec.toFixed(3)}秒`);
  linkSource(opts.videoPath, slug);

  if (exists(telopPath(slug)) && !opts.force) {
    const existing = readTelop(slug);
    log.skip(`テロップは既にある（${existing.chunks.length}枚）。作り直すなら --force`);
    writeTelopProps(slug, existing);
    return { slug, telop: existing };
  }

  log.step("音声を取り出す（16kHz モノラル PCM）");
  const wavPath = telopWavPath(slug);
  const fmt = await extractPcmWav({ videoPath: opts.videoPath, outPath: wavPath });
  log.ok(`${fmt.durationSec.toFixed(3)}秒`);
  // 映像と音声の長さが大きく違う動画はテロップの時刻が信用できない
  const gap = Math.abs(fmt.durationSec - shape.durationSec);
  if (gap > 1) {
    log.warn(`映像と音声の長さが ${gap.toFixed(2)}秒 違う。テロップの末尾が合わない可能性がある`);
  }

  // 無音に数分かけない。認識が空で返る原因のほとんどはここ
  const level = audioLevel(wavPath);
  log.info(`音量 実効値 ${level.rms.toFixed(4)} / 最大 ${level.peak.toFixed(4)}`);
  if (level.rms < SILENCE_RMS) {
    throw new Halt("音声トラックが実質無音。認識にかけても何も出ない", [
      `抽出した音声を聞く: ${wavPath}`,
      "音声が別トラックに入っている動画かもしれない",
    ]);
  }

  log.step(`音声認識（${config.caption.model}）`);
  const asr = await transcribeWav(wavPath);
  mkdirSync(dirname(telopAsrPath(slug)), { recursive: true });
  writeFileSync(telopAsrPath(slug), `${JSON.stringify(asr, null, 2)}\n`, "utf8");
  if (asr.tokens.length === 0) {
    throw new Halt("認識結果が空。音声が入っていない動画かもしれない", [
      `抽出した音声を聞く: ${wavPath}`,
      `言語の指定を確認する: config/pipeline.ts の caption.language（現在 ${config.caption.language}）`,
    ]);
  }
  log.ok(`${asr.tokens.length} トークン / ${asr.text.length} 文字`);

  const options = telopOptions(fmt.durationSec);
  const chunks = toTelopChunks(asr.tokens, options);
  const problems = checkTelopChunks(chunks, options);
  if (problems.length > 0) {
    // ここで落ちるのは post-processing のバグ。テロップを出す前に止める
    throw new Error(
      `テロップの区間が不正:\n${problems.map((p) => `    ${p.rule}: ${p.message}`).join("\n")}`,
    );
  }

  const telop: TelopFile = {
    video: opts.videoPath,
    videoDurationSec: shape.durationSec,
    width: shape.width,
    height: shape.height,
    fps: shape.fps,
    locale: config.caption.language,
    engine: asr.engine,
    transcript: asr.text,
    chunks,
  };
  writeTelop(slug, telop);
  writeTelopProps(slug, telop);
  log.ok(`テロップ ${chunks.length}枚 → content/telops/${slug}.json`);
  log.info("固有名詞を直してから次へ: npm run caption:render -- --video <同じパス>");
  return { slug, telop };
};

if (isEntry(import.meta.url)) {
  await runMain(async () => {
    const args = parseArgs();
    await captionAsr({
      videoPath: resolveVideoPath(getString(args, "video") ?? args.positional[0]),
      force: args.flags.has("force"),
    });
  });
}
