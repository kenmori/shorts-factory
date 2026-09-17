/**
 * 過去分の (entity, version, angle) と変化軸の記録。
 *
 * URL 単位の dedupe では不十分。同一リリースが複数メディアで別URLになり、
 * 続報も別URLになる。判定は3つ組で行う（plan.md「重複判定」）。
 *
 * manual 経路では embedding を使わない（API が必要になって成立しない）。
 * angle の類似は script:prepare がプロンプト束に直近20件を同梱し、
 * Claude Code に自分で判断させる。コード側はハード判定だけ。
 */
import { z } from "zod";
import { PUBLISHED_FILE } from "./paths.ts";
import { exists, parseOrThrow, readJson, writeJson } from "./io.ts";

export const publishedEntrySchema = z.object({
  id: z.string(),
  entity: z.string(),
  version: z.string().nullable(),
  angle: z.string(),
  shelfLife: z.string(),
  /** 変化軸の組み合わせ（hookStyle/palette/layout）。3本連続の検出に使う */
  variantKey: z.string(),
  recordedAt: z.string(),
});

export const publishedFileSchema = z.object({ entries: z.array(publishedEntrySchema) });

export type PublishedEntry = z.infer<typeof publishedEntrySchema>;

export const loadPublished = (): PublishedEntry[] => {
  if (!exists(PUBLISHED_FILE)) {
    return [];
  }
  return parseOrThrow(publishedFileSchema, readJson(PUBLISHED_FILE), "content/published.json")
    .entries;
};

export const savePublished = (entries: PublishedEntry[]): void =>
  writeJson(PUBLISHED_FILE, { entries });

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

export const tripleKey = (e: {
  entity: string;
  version: string | null;
  angle: string;
}): string => `${norm(e.entity)}|${e.version === null ? "-" : norm(e.version)}|${norm(e.angle)}`;

/** 自分自身（同じ id）は衝突扱いにしない。再実行できないと冪等でなくなる */
export const findTripleCollision = (
  entries: PublishedEntry[],
  candidate: { id: string; entity: string; version: string | null; angle: string },
): PublishedEntry | undefined => {
  const key = tripleKey(candidate);
  return entries.find((e) => e.id !== candidate.id && tripleKey(e) === key);
};

/** 直近20件。プロンプト束に同梱する */
export const recentTriples = (entries: PublishedEntry[], n = 20): PublishedEntry[] =>
  entries.slice(-n);

/**
 * 同じ変化軸の組み合わせが3本連続していないか。
 * 直近2件が candidate と同じなら「3本連続」になるので落とす。
 */
export const variantRepeatsThreeTimes = (
  entries: PublishedEntry[],
  candidate: { id: string; variantKey: string },
): boolean => {
  const history = entries.filter((e) => e.id !== candidate.id).slice(-2);
  return history.length === 2 && history.every((e) => e.variantKey === candidate.variantKey);
};

export const recordPublished = (entry: PublishedEntry): void => {
  const entries = loadPublished().filter((e) => e.id !== entry.id);
  entries.push(entry);
  savePublished(entries);
};
