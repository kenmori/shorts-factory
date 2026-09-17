/**
 * プロンプト束の書き出し。**両経路（manual / api）で共通。LLM は呼ばない。**
 *
 * 一次ソースを fetch して `.work/<id>/` に置く:
 *   prompt.md        そのまま Claude Code に渡せる自己完結の指示
 *   sources/NN.txt   本文の抜粋（excerpt の元）
 *   sources/NN.html  取得した生データ（抜粋が雑なときに自分で読む用）
 *   context.json     台本 JSON に貼る sources[] とネタのメタデータ
 *
 * dedupe のために**直近20件の (entity, version, angle) を prompt.md に同梱する。**
 * embedding を使わないのはそれだけで API が必要になり manual 経路が成立しないから。
 * Claude Code が自分で重複を判断できるので不要（ハード判定はコード側）。
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/pipeline.ts";
import { getString, getTopic, parseArgs } from "./lib/args.ts";
import { writeJson, writeText, readText } from "./lib/io.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { PROMPTS_DIR, workDir } from "./lib/paths.ts";
import { loadPublished, recentTriples } from "./lib/published.ts";
import { buildId, findTopicBySlug, loadTopics, slugFromId, type Topic } from "./lib/topics.ts";
import { sha256 } from "./lib/hash.ts";
import { deriveVariant } from "../src/design/variants.ts";

const SCRIPT_PROMPT = join(PROMPTS_DIR, "script.md");
const EXCERPT_CHARS = 1200;

export type PreparedContext = {
  id: string;
  topic: Topic;
  /** prompts/script.md のハッシュ。キャッシュキーの prompt_version */
  promptVersion: string;
  sources: { url: string; fetchedAt: string; excerpt: string; ok: boolean }[];
};

/** HTML をざっくり本文にする。読みやすさより「引用できる材料が手元に来る」ことを優先 */
export const htmlToText = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

const fetchSource = async (
  url: string,
  index: number,
  dir: string,
): Promise<{ url: string; fetchedAt: string; excerpt: string; ok: boolean }> => {
  const fetchedAt = new Date().toISOString();
  const name = String(index + 1).padStart(2, "0");
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "shorts-factory/0.1 (+https://github.com/kenmori/shorts-factory)" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const raw = await res.text();
    const text = htmlToText(raw);
    writeText(join(dir, "sources", `${name}.html`), raw);
    writeText(join(dir, "sources", `${name}.txt`), text);
    return { url, fetchedAt, excerpt: text.slice(0, EXCERPT_CHARS), ok: true };
  } catch (err) {
    log.warn(`ソースの取得に失敗（${url}）: ${String(err)}`);
    writeText(
      join(dir, "sources", `${name}.txt`),
      `取得に失敗: ${String(err)}\nURL: ${url}\n\nブラウザで開いて本文をここに貼る。\n`,
    );
    return { url, fetchedAt, excerpt: "", ok: false };
  }
};

const buildPrompt = (ctx: PreparedContext): string => {
  if (!existsSync(SCRIPT_PROMPT)) {
    throw new Error(`${SCRIPT_PROMPT} が無い`);
  }
  // プロンプト本体は prompts/script.md にだけ置く。TS の文字列に埋めない。
  // manual 経路と api 経路が**同一のプロンプトを使う**ことが切替の前提条件。
  const base = readText(SCRIPT_PROMPT);
  const variant = deriveVariant(ctx.id);
  const recent = recentTriples(loadPublished());

  const sourceBlocks = ctx.sources
    .map((s, i) => {
      const body = s.ok
        ? s.excerpt
        : `（取得に失敗。.work/${ctx.id}/sources/${String(i + 1).padStart(2, "0")}.txt を見て手で貼る）`;
      return [`### ソース${i + 1}: ${s.url}`, `取得: ${s.fetchedAt}`, "", body].join("\n");
    })
    .join("\n\n");

  const recentBlock =
    recent.length === 0
      ? "（まだ無い）"
      : recent
          .map((e) => `- ${e.entity} / ${e.version ?? "-"} / ${e.angle}（${e.id}）`)
          .join("\n");

  return [
    base.trim(),
    "",
    "---",
    "",
    "# このネタ",
    "",
    `- 動画 id: \`${ctx.id}\``,
    `- topic: ${ctx.topic.title}`,
    `- format: ${ctx.topic.format}`,
    `- entity / version / angle: ${ctx.topic.entity} / ${ctx.topic.version ?? "null"} / ${ctx.topic.angle}`,
    `- shelfLife: ${ctx.topic.shelfLife}`,
    `- 尺の目標: ${config.durationRangeSec[0]}〜${config.durationRangeSec[1]}秒`,
    `- hookStyle: **${variant.hookStyle}**（id のハッシュから決まる。台本では省略してよい）`,
    ctx.topic.notes ? `- メモ: ${ctx.topic.notes}` : "",
    "",
    "## 出力先",
    "",
    `\`content/scripts/${ctx.id}.json\` に書く。`,
    `検証は \`npm run script:verify -- --topic ${ctx.id}\`。通るまで直す。`,
    "",
    "## 直近20件（重複を避ける）",
    "",
    "同じ (entity, version, angle) は reject される。バージョンが違えば別ネタとして通る。",
    "angle が実質同じものも避ける（ここは自分で判断する）。",
    "",
    recentBlock,
    "",
    "## 一次ソース",
    "",
    "**数値・日付・製品名はここからだけ取る。生成しない。**",
    `全文は \`.work/${ctx.id}/sources/\` にある。`,
    "",
    sourceBlocks,
    "",
    "## 台本 JSON に貼る sources[]",
    "",
    `\`.work/${ctx.id}/context.json\` の \`sources\` をそのまま使う（fetchedAt を書き換えない）。`,
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
};

export const prepareTopic = async (id: string): Promise<PreparedContext> => {
  const slug = slugFromId(id);
  const topic = findTopicBySlug(loadTopics(), slug);
  if (!topic) {
    throw new Error(`content/topics.yaml に slug=${slug} が無い`);
  }

  const dir = workDir(id);
  rmSync(dir, { recursive: true, force: true });

  log.step(`プロンプト束の作成: ${id}`);
  const sources: PreparedContext["sources"] = [];
  for (const [i, url] of topic.sources.entries()) {
    sources.push(await fetchSource(url, i, dir));
  }

  const ctx: PreparedContext = {
    id,
    topic,
    promptVersion: sha256(readText(SCRIPT_PROMPT)).slice(0, 12),
    sources,
  };

  writeJson(join(dir, "context.json"), {
    id,
    topic,
    promptVersion: ctx.promptVersion,
    sources: ctx.sources.map((s) => ({ url: s.url, fetchedAt: s.fetchedAt, excerpt: s.excerpt })),
  });
  writeText(join(dir, "prompt.md"), buildPrompt(ctx));

  const failed = sources.filter((s) => !s.ok).length;
  if (failed > 0) {
    log.warn(`${failed}件のソースが取得できていない。.work/${id}/sources/ を見て手で貼る`);
  }
  log.ok(`.work/${id}/ に prompt.md と sources/ を書き出した`);
  return ctx;
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const date = getString(args, "date") ?? new Date().toISOString().slice(0, 10);
  const slug = getString(args, "slug");
  const id = getTopic(args) ?? (slug === undefined ? undefined : buildId(date, slug));
  if (!id) {
    throw new Error("--topic <id>（<YYYY-MM-DD>-<slug>）か --slug <slug> を指定する");
  }
  await prepareTopic(id);
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
