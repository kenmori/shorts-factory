/**
 * 音声合成 → 字幕 → タイムライン。
 *
 * 出力（すべて生成物・git 管理しない）:
 *   public/audio/<id>/*.wav       セグメントごとの音声（内容アドレス名）
 *   content/captions/<id>.json    @remotion/captions の Caption[]
 *   content/timeline/<id>.json    尺と字幕の確定値
 *   public/props/<id>.json        レンダー props（台本 + タイムライン）
 *
 * `durationSec` は**音声長から逆算する。** 台本に書いてあっても無視して
 * 実測で上書きする（手打ちした尺は必ずズレる）。
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { config, type TtsEngineId } from "../config/pipeline.ts";
import { stripChunkMarks, toChunks, type Script } from "../src/schema/script.ts";
import {
  timelineSchema,
  type AudioSegment,
  type Caption,
  type SegmentTiming,
  type Timeline,
} from "../src/schema/timeline.ts";
import { getEngine } from "./tts/index.ts";
import type { SynthSegment, Utterance } from "./tts/types.ts";
import { createAudioCache } from "./lib/audio-cache.ts";
import { sha256Buffer } from "./lib/hash.ts";
import { getString, getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { loadScript, saveRenderProps, saveTimeline } from "./lib/script-io.ts";
import { captionsPath, PUBLIC_AUDIO_DIR, PUBLIC_DIR } from "./lib/paths.ts";
import { writeJson } from "./lib/io.ts";

export type SynthesizeOptions = {
  offline?: boolean;
  /** config を上書きする。CI や配線確認で mock を使うときだけ */
  engineId?: TtsEngineId;
};

const toUtterance = (narration: string): Utterance => ({
  text: stripChunkMarks(narration),
  chunks: toChunks(narration),
});

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export const synthesizeTopic = async (
  id: string,
  options: SynthesizeOptions = {},
): Promise<Timeline> => {
  const script = loadScript(id);
  const engine = getEngine(options.engineId ?? config.tts);
  const offline = options.offline === true;

  log.step(`音声合成: ${id}（engine=${engine.id}${offline ? " / offline" : ""}）`);
  if (engine.id === "mock") {
    log.warn("mock エンジン（無音・尺は概算）。投稿用には使えない（publish-check が落とす）");
  }

  const cache = createAudioCache({ signature: engine.signature, ext: engine.ext, offline });

  // セクションと outro を順に合成する
  const sectionSegments: SynthSegment[][] = [];
  for (const section of script.sections) {
    sectionSegments.push(await engine.synthesize(toUtterance(section.narration), cache.fn));
  }
  const outroSegments = await engine.synthesize(toUtterance(script.outro), cache.fn);

  log.info(`キャッシュ: hit ${cache.stats.hit} / miss ${cache.stats.miss}`);

  // --- 音声を public/ へ置く。ファイル名は内容のハッシュ（同じ文面は1ファイル） ---
  const audioDir = join(PUBLIC_AUDIO_DIR, id);
  rmSync(audioDir, { recursive: true, force: true });
  mkdirSync(audioDir, { recursive: true });

  const place = (segment: SynthSegment): string => {
    const name = `${sha256Buffer(segment.audio).slice(0, 16)}.${engine.ext}`;
    const dest = join(audioDir, name);
    writeFileSync(dest, segment.audio);
    return relative(PUBLIC_DIR, dest).split("\\").join("/");
  };

  // --- タイムラインを組む ---
  const audio: AudioSegment[] = [];
  const captions: Caption[] = [];

  /** セグメント列を startSec から並べ、区間（開始・尺）を返す */
  const layout = (segments: SynthSegment[], startSec: number): SegmentTiming => {
    let cursor = startSec;
    for (const segment of segments) {
      const src = place(segment);
      audio.push({ src, startSec: round3(cursor), durationSec: round3(segment.durationSec) });
      for (const chunk of segment.captions) {
        const startMs = Math.round((cursor + chunk.startSec) * 1000);
        captions.push({
          text: chunk.text,
          startMs,
          endMs: Math.round((cursor + chunk.endSec) * 1000),
          timestampMs: startMs,
          confidence: null,
          // 1チャンク = 1ページ。日本語はスペースで割れないので明示する
          pageBreakAfter: true,
        });
      }
      cursor += segment.durationSec;
    }
    return {
      startSec: round3(startSec),
      // 末尾に余白。最後の音節と同時に画面が切り替わると詰まって聞こえる
      durationSec: round3(cursor - startSec + config.sectionTailSec),
    };
  };

  // フックは**重ねる**だけ。無音の静止画期間は作らない。
  // ナレーションは 0 秒から始める（「まだ始まっていない画面」を作らないため）
  const hook: SegmentTiming = { startSec: 0, durationSec: config.hookOverlaySec };
  let cursor = 0;

  const sections: SegmentTiming[] = [];
  for (const segments of sectionSegments) {
    const timing = layout(segments, cursor);
    sections.push(timing);
    cursor = timing.startSec + timing.durationSec;
  }
  const outro = layout(outroSegments, cursor);
  cursor = outro.startSec + outro.durationSec;

  const timeline: Timeline = timelineSchema.parse({
    id,
    fps: config.fps,
    engine: engine.id,
    voiceSignature: engine.signature,
    audio,
    bgmSrc: `bgm/${script.bgm}`,
    hook,
    sections,
    outro,
    totalDurationSec: round3(cursor),
    captions,
    generatedAt: new Date().toISOString(),
  });

  saveTimeline(timeline);
  writeJson(captionsPath(id), timeline.captions);
  saveRenderProps(script, timeline);

  warnIfOutOfRange(script, timeline);
  log.ok(`尺 ${timeline.totalDurationSec}秒 / 字幕 ${captions.length}チャンク`);
  return timeline;
};

/**
 * 尺が範囲外なら、**何文字足す／削るかを実測から出す。**
 *
 * 文字数から尺を推定すると1割ずれる（漢字の多さでモーラ数が変わるため）。
 * いま合成した音声の実測値を使えば推定が要らない。
 */
const warnIfOutOfRange = (script: Script, timeline: Timeline): void => {
  const [min, max] = config.durationRangeSec;
  const actual = timeline.totalDurationSec;
  if (actual >= min && actual <= max) {
    return;
  }

  const chars = [...script.sections.map((s) => s.narration), script.outro]
    .map((n) => [...stripChunkMarks(n)].length)
    .reduce((a, b) => a + b, 0);
  const audioSec = timeline.audio.reduce((a, s) => a + s.durationSec, 0);
  const charsPerSec = chars / audioSec;
  const avgChunkChars = chars / Math.max(1, timeline.captions.length);

  // 下限・上限に張り付けず中央を狙う（実測には数%のばらつきがある）
  const target = (min + max) / 2;
  const deltaSec = target - actual;
  const deltaChars = Math.round(deltaSec * charsPerSec);
  const deltaChunks = Math.round(Math.abs(deltaChars) / avgChunkChars);

  log.warn(
    `尺 ${actual}秒 が ${min}〜${max}秒 から外れている（台本の目標は ${script.totalDurationSec}秒）`,
  );
  log.info(
    `実測: ${charsPerSec.toFixed(2)}文字/秒（この話者・この台本。チャンクの前後の無音を含む）`,
  );
  log.info(
    `ナレーションを${deltaSec > 0 ? "約" : "約"}${Math.abs(deltaChars)}文字 ` +
      `${deltaSec > 0 ? "足す" : "削る"}（${deltaChunks}チャンクぶん）→ ${target}秒 になる`,
  );
  log.info("直したチャンクだけ再合成される（他はキャッシュに当たる）");
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  const engineId = getString(args, "tts") as TtsEngineId | undefined;
  await synthesizeTopic(id, { offline: args.flags.has("offline"), engineId });
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
