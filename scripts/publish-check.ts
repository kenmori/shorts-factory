/**
 * 投稿前ゲート。**機械で見られるものは全部ここで落とす。**
 *
 * 投稿後は修正できない（削除して再投稿しかなく、再投稿すると初動データが失われる）。
 * だから修正の容易さより投稿前ゲートの厳格さが重要で、チェックリストを
 * 人間の記憶に置かない（plan.md「投稿後は修正できない」）。
 *
 * ここを通ってから目で見る。人間が見るのは最後に出る3点だけ。
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/pipeline.ts";
import { SAFE_AREA, unverifiedPlatforms } from "../src/design/safe-area.ts";
import { getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { mp4DurationSec } from "./lib/mp4.ts";
import { outDir, PUBLIC_DIR, publishPath, timelinePath } from "./lib/paths.ts";
import { mtime } from "./lib/fresh.ts";
import {
  loadPublish,
  loadScript,
  loadTimeline,
  publishExists,
  timelineExists,
} from "./lib/script-io.ts";
import { lintScript, lintTimeline, type Finding } from "./lint-script.ts";

type Check = { ok: boolean; label: string; detail?: string };

const run = (label: string, fn: () => string | null): Check => {
  try {
    const detail = fn();
    return detail === null ? { ok: true, label } : { ok: false, label, detail };
  } catch (err) {
    return { ok: false, label, detail: err instanceof Error ? err.message : String(err) };
  }
};

const findingsDetail = (findings: Finding[]): string | null => {
  const errors = findings.filter((f) => f.level === "error");
  if (errors.length === 0) {
    return null;
  }
  return errors.map((f) => `[${f.rule}] ${f.message}`).join("\n           ");
};

export const publishCheck = (id: string): boolean => {
  const checks: Check[] = [];

  checks.push(run("台本がスキーマと lint を通る", () => findingsDetail(lintScript(loadScript(id)))));

  if (!timelineExists(id)) {
    checks.push({
      ok: false,
      label: "タイムラインがある",
      detail: `content/timeline/${id}.json が無い。npm run today を先に回す`,
    });
    report(id, checks);
    return false;
  }

  const script = loadScript(id);
  const timeline = loadTimeline(id);

  checks.push(
    run("音声が本番エンジンで作られている", () =>
      timeline.engine === "mock"
        ? "mock エンジン（無音）で作られている。VOICEVOX か ElevenLabs で作り直す"
        : null,
    ),
  );

  checks.push(run("尺と視覚変化の lint を通る", () => findingsDetail(lintTimeline(script, timeline))));

  checks.push(
    run("音声ファイルが全部ある", () => {
      const missing = timeline.audio
        .map((a) => a.src)
        .filter((src) => !existsSync(join(PUBLIC_DIR, src)));
      return missing.length === 0 ? null : `無い: ${missing.join(", ")}`;
    }),
  );

  checks.push(
    run("BGM がある", () =>
      existsSync(join(PUBLIC_DIR, timeline.bgmSrc)) ? null : `public/${timeline.bgmSrc} が無い`,
    ),
  );

  // --- レンダー済みの実ファイルを見る ---
  for (const platform of config.platforms) {
    const path = join(outDir(id), `${platform}.mp4`);
    checks.push(
      run(`${platform}.mp4 が投稿できる状態`, () => {
        if (!existsSync(path)) {
          return `${path} が無い`;
        }
        if (statSync(path).size < 100_000) {
          return `${path} が小さすぎる（レンダーが途中で落ちている）`;
        }
        // 尺のズレを疑う前に「古いだけ」かを見る。
        // 台本や音声を直したあとレンダーしていない場合がほとんどなので、
        // 原因を言い当てないと直し方が分からない
        if (statSync(path).mtimeMs < mtime(timelinePath(id))) {
          return (
            `${platform}.mp4 がタイムラインより古い（音声や台本を直したあとレンダーしていない）。` +
            `npm run render -- --topic ${id}`
          );
        }
        const actual = mp4DurationSec(path);
        if (actual < config.minPublishableDurationSec) {
          return `尺が ${actual.toFixed(1)}秒。${config.minPublishableDurationSec}秒 を超えていないと Creator Rewards の対象外`;
        }
        if (Math.abs(actual - timeline.totalDurationSec) > 0.5) {
          return `尺が計算値とずれている（mp4: ${actual.toFixed(2)}秒 / timeline: ${timeline.totalDurationSec}秒）`;
        }
        return null;
      }),
    );
  }

  // --- 投稿テキスト ---
  checks.push(
    run("投稿テキストが媒体別にある", () => {
      if (!publishExists(id)) {
        return `${publishPath(id)} が無い`;
      }
      const publish = loadPublish(id);
      const urls = script.sources.map((s) => s.url);
      if (!urls.some((url) => publish.shorts.description.includes(url))) {
        return "Shorts の description にソースURLが入っていない（検索流入の入口なので必須）";
      }
      if (publish.shorts.title.length === 0) {
        return "Shorts の title が空";
      }
      return null;
    }),
  );

  checks.push(
    run("日付の表示が shelfLife と合っている", () => {
      if (!publishExists(id)) {
        return "投稿テキストが無いので判定できない";
      }
      const publish = loadPublish(id);
      const dotted = script.sourceDate.slice(0, 10).split("-").join(".");
      const inCaption = publish.tiktok.caption.includes(dotted);
      if (script.shelfLife === "hot" && !inCaption) {
        return "hot なのにキャプションに情報の日付が無い（鮮度が価値そのもの）";
      }
      if (script.shelfLife === "evergreen" && inCaption) {
        return "evergreen なのにキャプションに日付が入っている（3ヶ月後に古く見える）";
      }
      return null;
    }),
  );

  const ok = report(id, checks);
  return ok;
};

const report = (id: string, checks: Check[]): boolean => {
  log.blank();
  for (const check of checks) {
    if (check.ok) {
      log.ok(check.label);
    } else {
      log.fail(`${check.label}: ${check.detail ?? ""}`);
    }
  }
  const failed = checks.filter((c) => !c.ok).length;
  log.blank();

  if (failed > 0) {
    log.fail(`${failed}件が通っていない。直してから目で見る`);
    return false;
  }

  log.step("機械のチェックは全部通った。次に自分の目で見るのは3点だけ");
  console.log(`
  1. 最初の2秒
     npm run still -- --topic ${id} --at 1.5
     音を想像せずに見る。意味が通るか
     → 落ちたら hook を書き直す（台本JSONだけの修正なので安い）

  2. テロップの被り
     npm run open -- --topic ${id}     ← フォルダを開く
     out/${id}/tiktok.mp4 を実機（iPhone）で再生。UIに文字が隠れていないか
     → 落ちたら src/design/safe-area.ts を実機の値で直す

  3. 音ズレ
     通しで1回見る。字幕と音声がずれていないか
     → 落ちたら scripts/synthesize.ts の問題（plan.md の M2 に戻る）

  投稿前のチェックリスト（機械で見られないもの）
     [ ] AIGC ラベルを付ける（TikTok は「その他のオプション」から）
     [ ] out/${id}/ の mp4 をそのまま使う（アプリ内で保存・編集していない）
     [ ] BGM は埋め込み済み。TikTok の楽曲ライブラリは使わない
`);

  const unverified = unverifiedPlatforms();
  if (unverified.length > 0) {
    log.warn(
      `セーフエリアが未実測の媒体: ${unverified.join(", ")}` +
        `（${Object.values(SAFE_AREA).length}媒体中）。実機で確認したら src/design/safe-area.ts を実測値にして verified: true にする`,
    );
  }
  return true;
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  log.step(`投稿前チェック: ${id}`);
  if (!publishCheck(id)) {
    throw new Error("投稿前ゲートが通っていない");
  }
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
