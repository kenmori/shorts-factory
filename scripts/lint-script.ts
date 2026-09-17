/**
 * リテンション設計の lint（plan.md 3.5節）。**CI で落とす。**
 *
 * 3.5節はすべて設計仮説で出典がない。「気をつける」で運用すると守られないので
 * 構造として実装する。metrics.yaml が溜まったら閾値をそちらで上書きする。
 *
 * 2段構え:
 *   lintScript(script)              台本だけで判定できるもの（script:verify）
 *   lintTimeline(script, timeline)  実測の尺が要るもの（publish-check）
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/pipeline.ts";
import { deriveVariant } from "../src/design/variants.ts";
import { toChunks, type Script } from "../src/schema/script.ts";
import type { Timeline } from "../src/schema/timeline.ts";
import {
  findTripleCollision,
  loadPublished,
  variantRepeatsThreeTimes,
} from "./lib/published.ts";
import { PUBLIC_BGM_DIR } from "./lib/paths.ts";

export type Finding = {
  level: "error" | "warn";
  rule: string;
  message: string;
};

export const HOOK_MAX_CHARS = 24;

/** ナレーションに依存する指示語。フックは音声なしで成立させる */
const DEICTIC = [
  "これ",
  "それ",
  "あれ",
  "この",
  "その",
  "あの",
  "こう",
  "そう",
  "ここ",
  "そこ",
  "こちら",
  "そちら",
  "先ほど",
  "前述",
  "上記",
  "さっき",
];

/** hook から内容語を拾う。助詞・記号は落とす */
const hookKeywords = (hook: string): string[] => {
  const cleaned = hook.replace(/[?？!！、。．,.:：「」『』（）()\[\]【】〜~\-—/|]/g, " ");
  return cleaned
    .split(/[\sはがをにでとのもへやかなよねだですますますか]+/u)
    .map((t) => t.trim())
    .filter((t) => [...t].length >= 2);
};

const chars = (s: string): number => [...s].length;

export const lintScript = (script: Script): Finding[] => {
  const findings: Finding[] = [];
  const add = (level: Finding["level"], rule: string, message: string): void => {
    findings.push({ level, rule, message });
  };

  // --- フック ---
  if (chars(script.hook) > HOOK_MAX_CHARS) {
    add(
      "error",
      "hook-length",
      `hook が ${chars(script.hook)}文字（上限 ${HOOK_MAX_CHARS}）。全画面で1〜2行に収まらない`,
    );
  }
  const deictic = DEICTIC.filter((d) => script.hook.includes(d));
  if (deictic.length > 0) {
    add(
      "error",
      "hook-deictic",
      `hook に指示語 ${deictic.join(" / ")} がある。無音の1枚で意味が通らなくなる`,
    );
  }

  const derived = deriveVariant(script.id);
  if (script.hookStyle !== undefined && script.hookStyle !== derived.hookStyle) {
    add(
      "error",
      "hook-style",
      `hookStyle が id から導出される値と違う（台本: ${script.hookStyle} / 導出: ${derived.hookStyle}）。` +
        "フォーマット疲れ対策のローテートが崩れるので、省略するか導出値に合わせる",
    );
  }

  // --- オープンループ（hook の回収） ---
  const last = script.sections.length;
  if (script.payoffSection !== last) {
    add(
      "error",
      "payoff-section",
      `payoffSection が ${script.payoffSection}。最終セクション（${last}）で回収する`,
    );
  }
  const payoff = script.sections[script.payoffSection - 1];
  if (!payoff) {
    add("error", "payoff-section", `payoffSection ${script.payoffSection} に対応するセクションが無い`);
  } else {
    const keywords = hookKeywords(script.hook);
    const hit = keywords.filter((k) => payoff.narration.includes(k) || payoff.heading.includes(k));
    if (keywords.length > 0 && hit.length === 0) {
      add(
        "error",
        "payoff-wording",
        `回収セクションの narration / heading に hook の語（${keywords.join(" / ")}）が出てこない。` +
          "同じ言葉で閉じないとオープンループが閉じたと認識されない",
      );
    }
  }

  // --- 尺 ---
  const [min, max] = config.durationRangeSec;
  if (script.totalDurationSec < min || script.totalDurationSec > max) {
    add(
      "error",
      "duration-target",
      `totalDurationSec が ${script.totalDurationSec}秒。${min}〜${max}秒 にする`,
    );
  }

  // --- 重複判定（3つ組のハード判定）---
  const published = loadPublished();
  const collision = findTripleCollision(published, script);
  if (collision) {
    add(
      "error",
      "dedupe-triple",
      `(entity, version, angle) が ${collision.id} と同じ。バージョンか観点を変える`,
    );
  }

  // --- 変化軸が3本連続していないか ---
  if (variantRepeatsThreeTimes(published, { id: script.id, variantKey: derived.key })) {
    add(
      "error",
      "variant-streak",
      `変化軸の組み合わせ ${derived.key} が3本連続になる。id（slug）を変えてローテートをずらす`,
    );
  }

  // --- 日付の整合 ---
  const sourceDate = Date.parse(script.sourceDate);
  const publishedAt = Date.parse(script.publishedAt);
  if (sourceDate > publishedAt) {
    add("error", "date-order", "sourceDate が publishedAt より後になっている");
  }
  const ageDays = (publishedAt - sourceDate) / 86_400_000;
  if (script.shelfLife === "hot" && ageDays > 7) {
    add(
      "warn",
      "hot-stale",
      `hot なのに情報が ${Math.floor(ageDays)}日前。鮮度が価値なので evergreen にするか別のネタにする`,
    );
  }

  // --- 素材の存在 ---
  if (!existsSync(join(PUBLIC_BGM_DIR, script.bgm))) {
    add("error", "bgm-missing", `public/bgm/${script.bgm} が無い`);
  }
  for (const [i, section] of script.sections.entries()) {
    if (section.visual.kind === "screencast") {
      add(
        "error",
        "visual-unimplemented",
        `セクション${i + 1} の visual が screencast。ToolDemo（M5）が未実装なのでまだ使えない`,
      );
    }
    if (section.durationSec !== undefined) {
      add(
        "warn",
        "duration-handwritten",
        `セクション${i + 1} に durationSec が手打ちされている。音声長から逆算されるので無視される`,
      );
    }
    if (toChunks(section.narration).length < 2) {
      add(
        "warn",
        "chunk-count",
        `セクション${i + 1} の narration に "|" が無い。字幕が1枚で長くなり画面からあふれる`,
      );
    }
  }

  // --- 事実の固定 ---
  const urls = script.sources.map((s) => s.url);
  if (new Set(urls).size !== urls.length) {
    add("warn", "sources-duplicate", "sources に同じ URL が複数ある");
  }
  if (Object.keys(script.facts).length === 0) {
    add("warn", "facts-empty", "facts が空。数値や日付は facts に置いて台本本文から参照する");
  }

  return findings;
};

/** 実測の尺が確定してから判定するもの */
export const lintTimeline = (script: Script, timeline: Timeline): Finding[] => {
  const findings: Finding[] = [];
  const add = (level: Finding["level"], rule: string, message: string): void => {
    findings.push({ level, rule, message });
  };

  const [min, max] = config.durationRangeSec;
  if (timeline.totalDurationSec < min || timeline.totalDurationSec > max) {
    add(
      "error",
      "duration-actual",
      `実測の尺が ${timeline.totalDurationSec}秒。${min}〜${max}秒 にする（ナレーションを足す/削る）`,
    );
  }
  if (timeline.totalDurationSec < config.minPublishableDurationSec) {
    add(
      "error",
      "duration-crp",
      `尺が ${timeline.totalDurationSec}秒 で ${config.minPublishableDurationSec}秒 未満。` +
        "Creator Rewards の対象条件を外れる",
    );
  }

  // --- 視覚変化の間隔 ---
  const events: { sec: number; what: string }[] = [
    { sec: 0, what: "hook" },
    { sec: timeline.hook.durationSec, what: "セクション1の開始" },
  ];
  for (const [i, section] of timeline.sections.entries()) {
    events.push({ sec: section.startSec, what: `セクション${i + 1}の開始` });
    const authored = script.sections[i];
    if (authored) {
      for (const telop of authored.telop) {
        events.push({ sec: section.startSec + telop.atSec, what: `セクション${i + 1}のテロップ` });
      }
    }
  }
  for (const caption of timeline.captions) {
    events.push({ sec: caption.startMs / 1000, what: `字幕「${caption.text.slice(0, 8)}」` });
  }
  events.push({ sec: timeline.outro.startSec, what: "outro" });
  events.sort((a, b) => a.sec - b.sec);

  let worst = { gap: 0, at: 0, what: "" };
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const cur = events[i];
    if (!prev || !cur) {
      continue;
    }
    const gap = cur.sec - prev.sec;
    if (gap > worst.gap) {
      worst = { gap, at: prev.sec, what: cur.what };
    }
  }
  if (worst.gap > config.maxVisualStillSec) {
    add(
      "error",
      "visual-still",
      `${worst.at.toFixed(1)}秒 から ${worst.gap.toFixed(1)}秒 画面が動かない（上限 ${config.maxVisualStillSec}秒。次の変化は ${worst.what}）。` +
        '"|" を増やして字幕を割るか、テロップを足す',
    );
  }

  // --- テロップがセクションから溢れていないか ---
  for (const [i, section] of timeline.sections.entries()) {
    const authored = script.sections[i];
    if (!authored) {
      continue;
    }
    for (const telop of authored.telop) {
      if (telop.atSec + telop.durationSec > section.durationSec + 0.01) {
        add(
          "error",
          "telop-overflow",
          `セクション${i + 1} のテロップ「${telop.text}」が区間（${section.durationSec}秒）を超える`,
        );
      }
    }
  }

  return findings;
};

export const hasError = (findings: Finding[]): boolean => findings.some((f) => f.level === "error");
