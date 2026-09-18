/**
 * 投稿テキストの生成。台本1本から `Publish` 型（tiktok / shorts / reels）を出す。
 *
 * **媒体ごとに別物。**
 *   - TikTok に description は存在しない（キャプションのみ）
 *   - YouTube Shorts だけが title と description を別に持ち、**検索流入の入口**。
 *     ソースURLもここに置く
 *
 * 日付は `sourceDate` から機械的に差し込む（LLM に生成させると必ずずれる）。
 * 焼き込みと同じ規則で、`hot` はキャプションに日付を出し、
 * `evergreen` はバージョンだけにする（3ヶ月後に古く見えるとロングテールが死ぬ）。
 */
import { AIGC_NOTE, BASE_HASHTAGS, FORMAT_HASHTAGS, MAX_SHORTS_TITLE } from "../config/publish.ts";
import { config, type Platform } from "../config/pipeline.ts";
import { stripChunkMarks, type Script } from "../src/schema/script.ts";
import { publishSchema, type Publish } from "../src/schema/publish.ts";
import { getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { loadScript, loadTimeline, savePublish, timelineExists } from "./lib/script-io.ts";
import { writeJson } from "./lib/io.ts";
import { outDir } from "./lib/paths.ts";
import { join } from "node:path";

const formatDate = (iso: string): string => iso.slice(0, 10).split("-").join(".");

/** "Claude Code" → "#ClaudeCode" */
const entityTag = (entity: string): string => `#${entity.replace(/[^\p{L}\p{N}]/gu, "")}`;

const hashtagsFor = (script: Script, platform: Platform): string[] => {
  const tags = [
    ...BASE_HASHTAGS[platform],
    ...(FORMAT_HASHTAGS[script.format] ?? []),
    entityTag(script.entity),
  ];
  return [...new Set(tags)];
};

/** 日付の行。evergreen ではバージョン表記に置き換える */
const dateLine = (script: Script): string =>
  script.shelfLife === "hot"
    ? `情報の日付: ${formatDate(script.sourceDate)}`
    : script.version
      ? `${script.entity} ${script.version} 時点の内容`
      : `${script.entity} の解説`;

const bodyLines = (script: Script): string[] =>
  script.sections.map((s, i) => `${i + 1}. ${s.heading}`);

/**
 * 音声のクレジット表記。**VOICEVOX はキャラごとに規約が違う**ので、
 * 必要な文言は config に持たせて機械的に差し込む（忘れる余地を消す）。
 * mock（無音）なら不要。
 */
export const creditFor = (engine: string): string | null =>
  engine === "voicevox" ? config.voicevox.credit : null;

export const buildPublish = (script: Script, credit: string | null = null): Publish => {
  const headline = script.hook;
  const summary = bodyLines(script);
  const sources = script.sources.map((s) => s.url);
  const outro = stripChunkMarks(script.outro);

  const tiktokTags = hashtagsFor(script, "tiktok");
  const shortsTags = hashtagsFor(script, "shorts");
  const reelsTags = hashtagsFor(script, "reels");

  const notes = credit === null ? [AIGC_NOTE] : [AIGC_NOTE, credit];

  const tiktokCaption = [
    headline,
    "",
    ...summary,
    "",
    dateLine(script),
    ...notes,
    "",
    tiktokTags.join(" "),
  ].join("\n");

  const titleBase = script.version
    ? `${headline}｜${script.entity} ${script.version}`
    : `${headline}｜${script.entity}`;

  const shortsDescription = [
    headline,
    "",
    ...summary,
    "",
    outro,
    "",
    dateLine(script),
    "",
    "出典:",
    ...sources.map((url) => `- ${url}`),
    "",
    ...notes,
    "",
    shortsTags.join(" "),
  ].join("\n");

  const reelsCaption = [
    headline,
    "",
    ...summary,
    "",
    dateLine(script),
    ...notes,
    "",
    reelsTags.join(" "),
  ].join("\n");

  return publishSchema.parse({
    id: script.id,
    tiktok: { caption: tiktokCaption, hashtags: tiktokTags },
    shorts: {
      title: titleBase.slice(0, MAX_SHORTS_TITLE),
      description: shortsDescription,
      hashtags: shortsTags,
    },
    reels: { caption: reelsCaption, hashtags: reelsTags },
  });
};

export const publishTopic = (id: string): Publish => {
  const script = loadScript(id);
  // どのエンジンで音声を作ったかはタイムライン（生成物）に書いてある
  const credit = timelineExists(id) ? creditFor(loadTimeline(id).engine) : null;
  const publish = buildPublish(script, credit);
  savePublish(publish);
  // 動画と同じ場所にも置く。投稿作業でディレクトリを行き来しないため
  writeJson(join(outDir(id), "publish.json"), publish);
  log.ok(`content/publish/${id}.json と out/${id}/publish.json`);
  return publish;
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  log.step(`投稿テキスト: ${id}`);
  publishTopic(id);
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
