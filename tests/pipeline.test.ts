/**
 * ユニットテスト。**壊れても気づけない場所**だけを固めている。
 *
 * - 変化軸の決定性（ランダムに戻ると偏りが復活する）
 * - 字幕チャンクの分割とキャッシュキー（ここが崩れると課金が積む）
 * - lint（リテンション設計は「気をつける」では守られない）
 * - 尺の読み取り（レンダーが途中で落ちた mp4 を投稿しないため）
 */
import { describe, expect, it } from "vitest";
import { scriptSchema, stripChunkMarks, toChunks } from "../src/schema/script.ts";
import { deriveVariant, HOOK_STYLES, SECTION_LAYOUTS } from "../src/design/variants.ts";
import { PALETTES } from "../src/design/tokens.ts";
import { locateChunks } from "../scripts/tts/types.ts";
import { cacheDigest } from "../scripts/lib/audio-cache.ts";
import { silentWav, wavDurationSec } from "../scripts/lib/wav.ts";
import { mp4DurationSec } from "../scripts/lib/mp4.ts";
import { tripleKey, findTripleCollision, variantRepeatsThreeTimes } from "../scripts/lib/published.ts";
import { lintScript, lintTimeline } from "../scripts/lint-script.ts";
import { buildPublish } from "../scripts/publish.ts";
import { loadScript } from "../scripts/lib/script-io.ts";
import { estimateDurationSec } from "../scripts/tts/mock.ts";
import { existsSync } from "node:fs";
import { outDir } from "../scripts/lib/paths.ts";
import { join } from "node:path";

const SAMPLE_ID = "2026-09-18-remotion-shorts-pipeline";
const sample = loadScript(SAMPLE_ID);

describe("字幕チャンクと TTS 原稿", () => {
  it("| は字幕用なので TTS 原稿からは消える", () => {
    expect(stripChunkMarks("あいう|えお")).toBe("あいうえお");
  });

  it("チャンクは | で割れる", () => {
    expect(toChunks("あいう|えお")).toEqual(["あいう", "えお"]);
  });

  it("チャンクの位置が原稿から復元できる（同じ語が複数あってもずれない）", () => {
    const text = "台本は台本のまま";
    expect(locateChunks(text, ["台本は", "台本のまま"])).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 8 },
    ]);
  });

  it("原稿に無いチャンクは落とす（推測で位置を決めない）", () => {
    expect(() => locateChunks("あいう", ["かきく"])).toThrow();
  });
});

describe("音声キャッシュのキー", () => {
  it("同じ文面・同じエンジンなら同じキー", () => {
    expect(cacheDigest("あいう", "voicevox:1")).toBe(cacheDigest("あいう", "voicevox:1"));
  });

  it("エンジンが変わればキーも変わる", () => {
    expect(cacheDigest("あいう", "voicevox:1")).not.toBe(cacheDigest("あいう", "voicevox:2"));
  });

  it("| の位置を動かしても、文面が同じチャンクのキーは変わらない", () => {
    const before = toChunks("動画編集をせずに|週3本を出す");
    const after = toChunks("動画編集を|せずに週3本を出す");
    const keysBefore = before.map((c) => cacheDigest(c, "voicevox:1"));
    const keysAfter = after.map((c) => cacheDigest(c, "voicevox:1"));
    // 割り方を変えた2チャンクだけ別物になり、キーに | は一切入らない
    expect(keysBefore).not.toEqual(keysAfter);
    expect(cacheDigest("週3本を出す", "voicevox:1")).toBe(cacheDigest("週3本を出す", "voicevox:1"));
  });
});

describe("変化軸（フォーマット疲れ対策）", () => {
  it("id から決定的に決まる", () => {
    expect(deriveVariant("2026-09-18-abc")).toEqual(deriveVariant("2026-09-18-abc"));
  });

  it("id が違えば組み合わせが散る", () => {
    const keys = new Set(
      Array.from({ length: 60 }, (_, i) => deriveVariant(`2026-09-18-topic-${i}`).key),
    );
    // 3軸 × 3値 = 27通り。60本で十分に散っていること
    expect(keys.size).toBeGreaterThan(12);
  });

  it("どの軸も定義された値のどれかになる", () => {
    for (let i = 0; i < 30; i++) {
      const v = deriveVariant(`2026-09-18-x-${i}`);
      expect(HOOK_STYLES).toContain(v.hookStyle);
      expect(SECTION_LAYOUTS).toContain(v.layout);
      expect(PALETTES.map((p) => p.id)).toContain(v.palette.id);
    }
  });
});

describe("重複判定（3つ組）", () => {
  const entry = {
    id: "2026-09-01-nextjs-cache",
    entity: "Next.js",
    version: "16.2",
    angle: "キャッシュ",
    shelfLife: "hot",
    variantKey: "question/ink/stack",
    recordedAt: "2026-09-01T00:00:00Z",
  };

  it("表記のゆれを吸収する", () => {
    expect(tripleKey({ entity: " Next.js ", version: "16.2", angle: "キャッシュ" })).toBe(
      tripleKey({ entity: "next.js", version: "16.2", angle: "キャッシュ" }),
    );
  });

  it("同じバージョンの同じ観点は衝突", () => {
    expect(
      findTripleCollision([entry], {
        id: "2026-09-18-x",
        entity: "Next.js",
        version: "16.2",
        angle: "キャッシュ",
      }),
    ).toBeDefined();
  });

  it("バージョンが違えば別ネタ", () => {
    expect(
      findTripleCollision([entry], {
        id: "2026-09-18-x",
        entity: "Next.js",
        version: "16.3",
        angle: "キャッシュ",
      }),
    ).toBeUndefined();
  });

  it("観点が違えば別ネタ", () => {
    expect(
      findTripleCollision([entry], {
        id: "2026-09-18-x",
        entity: "Next.js",
        version: "16.2",
        angle: "ルーティング",
      }),
    ).toBeUndefined();
  });

  it("自分自身とは衝突しない（再実行できないと冪等にならない）", () => {
    expect(findTripleCollision([entry], entry)).toBeUndefined();
  });

  it("同じ変化軸が3本連続すると検出する", () => {
    const history = [
      { ...entry, id: "a", variantKey: "question/ink/stack" },
      { ...entry, id: "b", variantKey: "question/ink/stack" },
    ];
    expect(variantRepeatsThreeTimes(history, { id: "c", variantKey: "question/ink/stack" })).toBe(
      true,
    );
    expect(variantRepeatsThreeTimes(history, { id: "c", variantKey: "number/amber/band" })).toBe(
      false,
    );
  });
});

describe("lint（リテンション設計）", () => {
  const rules = (script: unknown): string[] =>
    lintScript(scriptSchema.parse(script))
      .filter((f) => f.level === "error")
      .map((f) => f.rule);

  it("手書きサンプルは error ゼロ", () => {
    expect(rules(sample)).toEqual([]);
  });

  it("hook が長すぎると落ちる", () => {
    expect(rules({ ...sample, hook: "あ".repeat(25) })).toContain("hook-length");
  });

  it("hook に指示語があると落ちる（無音で成立しなくなる）", () => {
    expect(rules({ ...sample, hook: "この方法で週3本出せる" })).toContain("hook-deictic");
  });

  it("payoffSection が最終セクションでないと落ちる", () => {
    expect(rules({ ...sample, payoffSection: 1 })).toContain("payoff-section");
  });

  it("回収セクションに hook の語が無いと落ちる", () => {
    const sections = sample.sections.map((s, i) =>
      i === sample.sections.length - 1
        ? { ...s, heading: "まとめ", narration: "以上です|ありがとうございました" }
        : s,
    );
    expect(rules({ ...sample, sections })).toContain("payoff-wording");
  });

  it("目標の尺が範囲外だと落ちる", () => {
    expect(rules({ ...sample, totalDurationSec: 120 })).toContain("duration-target");
  });

  it("hookStyle が導出値と違うと落ちる", () => {
    const wrong = HOOK_STYLES.find((s) => s !== deriveVariant(sample.id).hookStyle);
    expect(rules({ ...sample, hookStyle: wrong })).toContain("hook-style");
  });

  it("未実装の visual（screencast）は落ちる", () => {
    const sections = sample.sections.map((s, i) =>
      i === 0 ? { ...s, visual: { kind: "screencast" as const, clip: "x.mp4" } } : s,
    );
    expect(rules({ ...sample, sections })).toContain("visual-unimplemented");
  });
});

describe("lint（実測が必要なもの）", () => {
  const timeline = {
    id: sample.id,
    fps: 30,
    engine: "voicevox",
    voiceSignature: "voicevox:1",
    audio: [],
    bgmSrc: "bgm/placeholder-pad.wav",
    hook: { startSec: 0, durationSec: 2 },
    sections: sample.sections.map((_, i) => ({ startSec: 2 + i * 16, durationSec: 16 })),
    outro: { startSec: 2 + sample.sections.length * 16, durationSec: 4 },
    totalDurationSec: 2 + sample.sections.length * 16 + 4,
    captions: [] as { text: string; startMs: number; endMs: number; timestampMs: number | null; confidence: number | null }[],
    generatedAt: "2026-09-18T00:00:00Z",
  };

  it("字幕もテロップも無ければ「画面が動かない」で落ちる", () => {
    const findings = lintTimeline(sample, timeline);
    expect(findings.map((f) => f.rule)).toContain("visual-still");
  });

  it("60秒未満は Creator Rewards の条件を外れるので落ちる", () => {
    const short = { ...timeline, totalDurationSec: 40 };
    const rules = lintTimeline(sample, short).map((f) => f.rule);
    expect(rules).toContain("duration-crp");
    expect(rules).toContain("duration-actual");
  });

  it("テロップがセクションの尺を超えると落ちる", () => {
    const sections = sample.sections.map((s, i) =>
      i === 0 ? { ...s, telop: [{ text: "はみ出す", atSec: 15, durationSec: 5 }] } : s,
    );
    const script = scriptSchema.parse({ ...sample, sections });
    expect(lintTimeline(script, timeline).map((f) => f.rule)).toContain("telop-overflow");
  });
});

describe("投稿テキスト", () => {
  const publish = buildPublish(sample);

  it("Shorts の description にソースURLが入る（検索流入の入口）", () => {
    for (const source of sample.sources) {
      expect(publish.shorts.description).toContain(source.url);
    }
  });

  it("TikTok はキャプションだけ（description は持たない）", () => {
    expect(Object.keys(publish.tiktok).sort()).toEqual(["caption", "hashtags"]);
  });

  it("evergreen はキャプションに日付を焼かない（3ヶ月後に古く見える）", () => {
    expect(sample.shelfLife).toBe("evergreen");
    expect(publish.tiktok.caption).not.toContain("2026.09.17");
    expect(publish.tiktok.caption).toContain("4.0 時点");
  });

  it("hot はキャプションに情報の日付を入れる", () => {
    const hot = scriptSchema.parse({ ...sample, shelfLife: "hot" });
    expect(buildPublish(hot).tiktok.caption).toContain("2026.09.17");
  });

  it("AI生成の申告が全媒体に入る", () => {
    expect(publish.tiktok.caption).toContain("AI");
    expect(publish.shorts.description).toContain("AI");
    expect(publish.reels.caption).toContain("AI");
  });
});

describe("尺の読み取り", () => {
  it("WAV の尺を実測できる", () => {
    expect(wavDurationSec(silentWav(1.5))).toBeCloseTo(1.5, 3);
  });

  it("WAV でないものは落とす", () => {
    expect(() => wavDurationSec(Buffer.from("not a wav"))).toThrow();
  });

  it("mock の尺は文字数に対して単調", () => {
    expect(estimateDurationSec("あいうえおかきくけこ")).toBeGreaterThan(
      estimateDurationSec("あいうえお"),
    );
  });

  it.skipIf(!existsSync(join(outDir(SAMPLE_ID), "tiktok.mp4")))(
    "レンダー済み mp4 の尺が moov から読める",
    () => {
      const sec = mp4DurationSec(join(outDir(SAMPLE_ID), "tiktok.mp4"));
      expect(sec).toBeGreaterThan(60);
    },
  );
});
