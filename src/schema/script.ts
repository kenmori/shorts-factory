/**
 * 台本 JSON のスキーマ。**このプロジェクトの中核。**
 *
 * テンプレ側は props を受けるだけにする。ここを固定すると LLM 側もテンプレ側も
 * 安定する。スキーマを緩めて台本を通すのは禁止（CLAUDE.md）。
 *
 * ここは「構造」だけを見る。尺やフックの文字数といったリテンション設計の規則は
 * scripts/lint-script.ts 側（plan.md 3.5節）にある。
 */
import { z } from "zod";

export const localeSchema = z.enum(["ja", "en"]);
export const formatSchema = z.enum(["news-digest", "tool-demo", "code-diff", "data-viz"]);
export const shelfLifeSchema = z.enum(["hot", "evergreen"]);
export const hookStyleSchema = z.enum(["question", "number", "negation"]);

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "ISO 8601 の日付にする" });

/** "2026-09-18-claude-code-hooks" */
const idSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/, "id は <YYYY-MM-DD>-<slug> の形にする");

export const telopSchema = z.object({
  text: z.string().min(1),
  /** セクション開始からの相対秒 */
  atSec: z.number().min(0),
  durationSec: z.number().positive(),
});

export const chartDataSchema = z.object({
  unit: z.string().default(""),
  bars: z
    .array(z.object({ label: z.string().min(1), value: z.number() }))
    .min(2)
    .max(5),
});

export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const visualSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), lead: z.string().min(1) }),
  /**
   * 画像。**2枚以上置くと字幕のチャンク境界で切り替わる。**
   * 1セクション1枚だと68秒で視覚が4回しか変わらず飽きるため。
   * ファイルは public/shots/ に置く（実スクショ / 図 / 生成画像）。
   */
  z.object({
    kind: z.literal("image"),
    shots: z.array(z.string().min(1)).min(1).max(8),
    /** 画像の上に重ねる短い文。省略可 */
    lead: z.string().min(1).optional(),
    /** cover = 枠を埋める（はみ出しは切る） / contain = 全体を見せる（余白が出る） */
    fit: z.enum(["cover", "contain"]).default("cover"),
  }),
  z.object({ kind: z.literal("chart"), data: chartDataSchema }),
  z.object({
    kind: z.literal("code"),
    before: z.string().min(1),
    after: z.string().min(1),
    lang: z.string().min(1),
  }),
  z.object({ kind: z.literal("screencast"), clip: z.string().min(1), zoom: rectSchema.optional() }),
]);

/**
 * `narration` の "|" は**字幕の割れ方**の指定。TTS へは除去して渡す。
 * ここを動かしても音声の内容は変わらない（= 再生成が要らない）ことが
 * イテレーション速度の前提になっている。
 */
const narrationSchema = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith("|") && !v.endsWith("|"), {
    message: "narration の先頭・末尾に | を置かない",
  })
  .refine((v) => v.split("|").every((c) => c.trim().length > 0), {
    message: "空のチャンク（|| や | の連続）を作らない",
  })
  .refine((v) => !/[\r\n]/.test(v), { message: "narration に改行を入れない（| で割る）" });

export const sectionSchema = z.object({
  heading: z.string().min(1).max(20),
  narration: narrationSchema,
  /** 音声非同期のデザイン要素。字幕とは別系統（plan.md「字幕とテロップは別物」） */
  telop: z.array(telopSchema).default([]),
  visual: visualSchema,
  /**
   * 音声長から逆算されるので**手打ちしない**。
   * 書いてあっても synthesize が実測値で上書きする（ヒント扱い）。
   */
  durationSec: z.number().positive().optional(),
});

export const sourceSchema = z.object({
  url: z.string().url(),
  fetchedAt: isoDate,
  excerpt: z.string().min(1),
});

export const scriptSchema = z
  .object({
    id: idSchema,
    /** フォント・改行・字幕チャンク分割が分岐する */
    locale: localeSchema,
    format: formatSchema,

    // --- 重複判定キー（文字列一致ではなくこの3つ組で判定）---
    entity: z.string().min(1),
    version: z.string().min(1).nullable(),
    angle: z.string().min(1),

    // --- 鮮度 ---
    shelfLife: shelfLifeSchema,
    /** 情報の日付。表示するのはこちら */
    sourceDate: isoDate,
    /** 動画の投稿日。表示しない */
    publishedAt: isoDate,

    // --- リテンション ---
    hook: z.string().min(1),
    /** 省略時は id のハッシュから決定的に決まる（src/design/variants.ts） */
    hookStyle: hookStyleSchema.optional(),
    /** hook を回収するセクション番号（1始まり・最終セクションであること） */
    payoffSection: z.number().int().positive(),

    sections: z.array(sectionSchema).min(3).max(5),
    outro: narrationSchema,
    /** public/bgm/ 以下のファイル名 */
    bgm: z.string().min(1),
    /** 目標尺。実測は synthesize が timeline に書く */
    totalDurationSec: z.number().positive(),

    // --- 事実の固定（LLMに生成させない）---
    sources: z.array(sourceSchema).min(1),
    facts: z.record(z.string(), z.string()),
  })
  .strict();

export type Locale = z.infer<typeof localeSchema>;
export type Format = z.infer<typeof formatSchema>;
export type ShelfLife = z.infer<typeof shelfLifeSchema>;
export type HookStyle = z.infer<typeof hookStyleSchema>;
export type Telop = z.infer<typeof telopSchema>;
export type ChartData = z.infer<typeof chartDataSchema>;
export type Visual = z.infer<typeof visualSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Script = z.infer<typeof scriptSchema>;

/** TTS に渡す原稿。"|" は字幕用の指定なので除去する */
export const stripChunkMarks = (narration: string): string => narration.split("|").join("");

/** 字幕チャンクへ分解する */
export const toChunks = (narration: string): string[] =>
  narration
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
