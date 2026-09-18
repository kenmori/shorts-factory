/**
 * 日次の1コマンド。**これ1つで足りる。**
 *
 *   1. content/topics.yaml から score 最高・未使用のトピックを選ぶ
 *   2. script:prepare で .work/<id>/ にプロンプト束を生成
 *   3. content/scripts/<id>.json が無い:
 *        manual → ここで停止し「Claude Code で /script <id>」と出す（勝手にAPIを叩かない）
 *        api    → script:generate を実行して続行
 *   4. script:verify（zod + lint + dedupe）
 *   5. 音声合成（キャッシュ優先）→ 字幕
 *   6. 3媒体レンダー
 *   7. publish テキスト生成 → publish-check
 *   8. out/<id>/ のパスを出力
 *
 * **冪等かつ再開可能。** 同じコマンドを2回叩けば止まった続きから進む。
 * 出力が入力より新しい工程は飛ばす（--force で全部やり直す）。
 */
import { join } from "node:path";
import { config } from "../config/pipeline.ts";
import { getString, getTopic, parseArgs, type Args } from "./lib/args.ts";
import { isFresh, mtime, needsSynthesis, newestMtime } from "./lib/fresh.ts";
import { Halt, log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import {
  outDir,
  propsPath,
  scriptPath,
  timelinePath,
  workDir,
  ROOT,
} from "./lib/paths.ts";
import { buildId, loadTopics, markTopic, pickNextTopic, slugFromId } from "./lib/topics.ts";
import { loadTimeline, scriptExists, timelineExists } from "./lib/script-io.ts";
import { prepareTopic } from "./script-prepare.ts";
import { generateScript } from "./script-generate.ts";
import { printFindings, verifyScript } from "./script-verify.ts";
import { synthesizeTopic } from "./synthesize.ts";
import { renderTopic } from "./render.ts";
import { publishTopic } from "./publish.ts";
import { publishCheck } from "./publish-check.ts";
import type { TtsEngineId } from "../config/pipeline.ts";

export type TodayOptions = {
  topicId?: string;
  date?: string;
  force?: boolean;
  offline?: boolean;
  engineId?: TtsEngineId;
};

/** 今日の id を決める。id は <投稿日>-<slug> */
const resolveId = (options: TodayOptions): string => {
  if (options.topicId) {
    return options.topicId;
  }
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const topic = pickNextTopic(loadTopics());
  if (!topic) {
    throw new Error(
      "content/topics.yaml に未使用のネタが無い。status: pending のネタを足す" +
        "（evergreen を常に5〜10本プールしておく）",
    );
  }
  log.info(`ネタ: ${topic.title}（score ${topic.score} / ${topic.shelfLife}）`);

  // 作りかけの動画があるなら、日付を跨いでもそれを続ける。
  // 新しい id を振ると台本を書き直させることになる
  if (topic.usedBy && scriptExists(topic.usedBy)) {
    log.skip(`作りかけを再開する: ${topic.usedBy}`);
    return topic.usedBy;
  }
  return buildId(date, topic.slug);
};

export const today = async (options: TodayOptions = {}): Promise<string> => {
  const force = options.force === true;
  const id = resolveId(options);
  log.step(`今日の動画: ${id}`);

  // --- 2. プロンプト束 ---
  const promptFile = join(workDir(id), "prompt.md");
  if (force || !isFresh(promptFile, [mtime(join(ROOT, "prompts", "script.md"))])) {
    await prepareTopic(id);
  } else {
    log.skip(`.work/${id}/ は最新`);
  }

  // --- 3. 台本（fulfill）---
  if (!scriptExists(id)) {
    await generateScript(id); // manual では no-op、api では生成
  }
  if (!scriptExists(id)) {
    throw new Halt(`台本がまだ無い: content/scripts/${id}.json`, [
      "Claude Code で次を実行する:",
      "",
      `  /script ${id}`,
      "",
      `プロンプト束は .work/${id}/prompt.md にある。`,
      "台本ができたら、もう一度 npm run today（止まった続きから進む）",
    ]);
  }
  log.ok(`台本: content/scripts/${id}.json`);

  // --- 4. 検証 ---
  log.step("検証（zod + lint + dedupe）");
  const { ok, findings } = verifyScript(id);
  printFindings(findings);
  if (!ok) {
    throw new Halt("lint の error を直してから再実行する", [
      `台本: content/scripts/${id}.json`,
      `再検証: npm run script:verify -- --topic ${id}`,
    ]);
  }
  markTopic(slugFromId(id), "scripted", id);

  // --- 5. 音声合成 → 字幕 ---
  const wantEngine = options.engineId ?? config.tts;
  const synth = needsSynthesis({
    force,
    scriptAt: mtime(scriptPath(id)),
    timelineAt: mtime(timelinePath(id)),
    propsAt: mtime(propsPath(id)),
    timelineEngine: timelineExists(id) ? loadTimeline(id).engine : null,
    wantEngine,
    // 尺・フックの重なり・末尾余白は config と合成コードで決まる
    layoutAt: Math.max(
      mtime(join(ROOT, "config", "pipeline.ts")),
      mtime(join(ROOT, "scripts", "synthesize.ts")),
    ),
  });
  if (synth.needed) {
    if (synth.reason === "engine-changed") {
      log.info(`エンジンが変わった（→ ${wantEngine}）ので音声を作り直す`);
    }
    if (synth.reason === "layout-changed") {
      log.info("config か合成コードが変わったのでタイムラインを作り直す");
    }
    await synthesizeTopic(id, {
      offline: options.offline === true,
      ...(options.engineId ? { engineId: options.engineId } : {}),
    });
  } else {
    log.skip("音声とタイムラインは最新（台本もエンジンも変わっていない）");
  }

  // --- 6. レンダー ---
  const inputs = [mtime(timelinePath(id)), newestMtime(join(ROOT, "src")), mtime(join(ROOT, "config", "pipeline.ts"))];
  const stale = config.platforms.filter(
    (platform) => force || !isFresh(join(outDir(id), `${platform}.mp4`), inputs),
  );
  if (stale.length > 0) {
    await renderTopic(id, { platforms: stale });
  } else {
    log.skip("3媒体の mp4 は最新");
  }

  // --- 7. 投稿テキスト → 投稿前ゲート ---
  log.step("投稿テキスト");
  publishTopic(id);

  log.step("投稿前チェック");
  if (!publishCheck(id)) {
    throw new Halt("投稿前ゲートが通っていない", [
      "上の FAIL を直してから再実行する（投稿後は修正できないのでここは緩めない）",
    ]);
  }

  log.blank();
  log.step(`できた: out/${id}/`);
  for (const platform of config.platforms) {
    log.info(`out/${id}/${platform}.mp4`);
  }
  log.info(`out/${id}/publish.json`);
  log.blank();
  log.info(`フォルダを開く:   npm run open -- --topic ${id}`);
  log.info(`投稿したら記録する: npm run record -- --topic ${id}`);
  return id;
};

const main = async (): Promise<void> => {
  const args: Args = parseArgs();
  const engineId = getString(args, "tts") as TtsEngineId | undefined;
  await today({
    ...(getTopic(args) ? { topicId: getTopic(args) } : {}),
    ...(getString(args, "date") ? { date: getString(args, "date") } : {}),
    force: args.flags.has("force"),
    offline: args.flags.has("offline"),
    ...(engineId ? { engineId } : {}),
  });
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
