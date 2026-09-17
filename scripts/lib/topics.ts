/**
 * ネタのバックログ。`npm run today` は「score 最高・未使用」を1件選ぶ。
 *
 * topic の id は日付を持たない（slug だけ）。動画の id は
 * `<投稿日>-<slug>` で組む。バックログに寝かせたネタの日付が腐らないように。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument, isSeq, isMap } from "yaml";
import { z } from "zod";
import { TOPICS_FILE } from "./paths.ts";
import { parseOrThrow, readYaml } from "./io.ts";
import { formatSchema, shelfLifeSchema } from "../../src/schema/script.ts";

export const topicStatusSchema = z.enum(["pending", "scripted", "published", "dropped"]);

export const topicSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "slug は小文字英数とハイフン"),
  title: z.string().min(1),
  /** 優先度。高いものから消化する */
  score: z.number(),
  status: topicStatusSchema.default("pending"),
  format: formatSchema.default("news-digest"),
  shelfLife: shelfLifeSchema,
  entity: z.string().min(1),
  version: z.string().nullable().default(null),
  angle: z.string().min(1),
  /** 一次ソース。script:prepare がここから excerpt を取る */
  sources: z.array(z.string().url()).min(1),
  notes: z.string().default(""),
  /** 消化したときに書き込まれる動画 id */
  usedBy: z.string().nullable().default(null),
});

export const topicsFileSchema = z.object({ topics: z.array(topicSchema) });

export type Topic = z.infer<typeof topicSchema>;
export type TopicStatus = z.infer<typeof topicStatusSchema>;

export const loadTopics = (): Topic[] =>
  parseOrThrow(topicsFileSchema, readYaml(TOPICS_FILE), "content/topics.yaml").topics;

/**
 * 1件のフィールドだけ書き換える。
 *
 * ファイル全体を stringify し直すと**コメントが消える。**
 * topics.yaml は運用ルール（配分・プールの本数）をコメントで持っているので、
 * yaml の Document API で該当ノードだけ触る。
 */
const patchTopic = (slug: string, patch: Record<string, string | null>): void => {
  const doc = parseDocument(readFileSync(TOPICS_FILE, "utf8"));
  const seq = doc.get("topics");
  if (!isSeq(seq)) {
    throw new Error("content/topics.yaml の topics が配列になっていない");
  }
  const node = seq.items.find((item) => isMap(item) && item.get("slug") === slug);
  if (!node || !isMap(node)) {
    return;
  }
  for (const [key, value] of Object.entries(patch)) {
    node.set(key, value);
  }
  writeFileSync(TOPICS_FILE, String(doc), "utf8");
};

/** score 最高・未使用。同点は slug 昇順で決定的に */
export const pickNextTopic = (topics: Topic[]): Topic | undefined =>
  topics
    .filter((t) => t.status === "pending" || t.status === "scripted")
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))[0];

export const findTopicBySlug = (topics: Topic[], slug: string): Topic | undefined =>
  topics.find((t) => t.slug === slug);

/** 動画 id から topic の slug を取り出す（id = <YYYY-MM-DD>-<slug>） */
export const slugFromId = (id: string): string => id.replace(/^\d{4}-\d{2}-\d{2}-/, "");

export const buildId = (date: string, slug: string): string => `${date}-${slug}`;

export const markTopic = (slug: string, status: TopicStatus, usedBy: string | null): void => {
  const current = findTopicBySlug(loadTopics(), slug);
  if (!current) {
    return;
  }
  if (current.status === status && (usedBy === null || current.usedBy === usedBy)) {
    return; // 変わらないなら書かない（mtime を無駄に動かさない）
  }
  patchTopic(slug, usedBy === null ? { status } : { status, usedBy });
};
