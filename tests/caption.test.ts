/**
 * モードB（手持ちの動画にテロップを付ける）のテスト。
 *
 * 音声認識そのものはモデルが要るのでここでは回さない。代わりに
 * **認識のあと**（時刻の整え方・テロップの割り方・突き合わせ）を固める。
 * ここが崩れると「音とテロップが合っていない動画」が黙って出てくる。
 *
 * 認識を含めた通しの実測は `npm run caption:verify`（自前の動画が素材）。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPcm16,
  decodePcm16,
  readWavFormat,
  silentWav,
} from "../scripts/lib/wav.ts";
import {
  audioLevel,
  extractPcmWav,
  SILENCE_RMS,
  WHISPER_SAMPLE_RATE,
} from "../scripts/lib/audio-extract.ts";
import { flattenTokens } from "../scripts/lib/asr.ts";
import { readMp4, videoShape } from "../scripts/lib/mp4.ts";
import { outDir, WORK_DIR } from "../scripts/lib/paths.ts";
import { slugForVideo } from "../scripts/lib/telop-io.ts";
import {
  checkTelopChunks,
  groupTokens,
  normalizeSpans,
  sanitizeTokens,
  telopAt,
  toTelopChunks,
  type AsrToken,
  type TelopChunk,
  type TelopOptions,
} from "../src/lib/telop.ts";
import {
  alignmentReport,
  alignTimedChars,
  percentile,
  toTimedChars,
  type Span,
} from "../src/lib/telop-align.ts";
import { telopFileSchema } from "../src/schema/telop.ts";

const SAMPLE_ID = "2026-09-18-remotion-shorts-pipeline";
const samplePath = join(outDir(SAMPLE_ID), "tiktok.mp4");

const OPTIONS = (audioDurationMs: number): TelopOptions => ({
  maxChars: 18,
  maxDurationMs: 2000,
  minDurationMs: 400,
  audioDurationMs,
});

/** 「圧縮音声が WAV 容器に入っているだけ」のファイルを作る */
const fakeCompressedWav = (opts: {
  audioFormat: number;
  byteRate: number;
  dataBytes: number;
}): Buffer => {
  const buf = Buffer.alloc(44 + opts.dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + opts.dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(opts.audioFormat, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(48000, 24);
  buf.writeUInt32LE(opts.byteRate, 28);
  buf.writeUInt16LE(1536, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(opts.dataBytes, 40);
  return buf;
};

describe("WAV の中身を信用しない", () => {
  it("PCM なら読める", () => {
    const fmt = readWavFormat(silentWav(2, 16000));
    expect(fmt.audioFormat).toBe(1);
    expect(fmt.channels).toBe(1);
    expect(fmt.sampleRate).toBe(16000);
    expect(fmt.bitsPerSample).toBe(16);
    expect(fmt.durationSec).toBeCloseTo(2, 4);
  });

  /**
   * 実際に踏んだ事故。`extractAudio` は AAC を再圧縮せずに WAV 容器へ入れるので
   * audioFormat=255 で出てくる。PCM とみなして「バイト数 ÷ (rate×ch×2)」で
   * 尺を出すと 67秒が 14秒に見え、テロップの時刻が全部ずれる。
   */
  it("圧縮音声が入った WAV は落とす（audioFormat を見る）", () => {
    const buf = fakeCompressedWav({ audioFormat: 255, byteRate: 39671, dataBytes: 2_674_413 });
    const fmt = readWavFormat(buf);
    // 尺は byteRate から出す。PCM と決めつけると 13.9秒 に見える
    expect(fmt.durationSec).toBeCloseTo(67.41, 1);
    expect(2_674_413 / (48000 * 2 * 2)).toBeCloseTo(13.93, 1);
    expect(() => assertPcm16(fmt)).toThrow(/PCM ではない/);
  });

  it("サンプリングレートとチャンネル数が違えば落とす", () => {
    const fmt = readWavFormat(silentWav(1, 24000));
    expect(() => assertPcm16(fmt, { sampleRate: WHISPER_SAMPLE_RATE })).toThrow(/16000Hz/);
    expect(() => assertPcm16(fmt, { channels: 2 })).toThrow(/チャンネル数/);
    expect(() => assertPcm16(fmt, { sampleRate: 24000, channels: 1 })).not.toThrow();
  });

  it("24bit は落とす（黙って壊れた値を読まない）", () => {
    const buf = fakeCompressedWav({ audioFormat: 1, byteRate: 48000 * 3, dataBytes: 300 });
    buf.writeUInt16LE(24, 34);
    expect(() => assertPcm16(readWavFormat(buf))).toThrow(/16bit 以外/);
  });

  it("PCM を -1..1 で読む", () => {
    const wav = silentWav(0.001, 16000);
    wav.writeInt16LE(16384, 44);
    wav.writeInt16LE(-32768, 46);
    const samples = decodePcm16(wav);
    expect(samples[0]).toBeCloseTo(0.5, 4);
    expect(samples[1]).toBeCloseTo(-1, 4);
  });

  it("WAV でないものは落とす", () => {
    expect(() => readWavFormat(Buffer.from("not a wav at all"))).toThrow(/WAV として読めない/);
  });
});

describe("認識トークンの時刻を整える", () => {
  it("whisper の制御トークンを落とす", () => {
    const tokens: AsrToken[] = [
      { text: "[_BEG_]", fromMs: 0, toMs: 0 },
      { text: "<|ja|>", fromMs: 0, toMs: 0 },
      { text: " ", fromMs: 0, toMs: 10 },
      { text: "動画", fromMs: 100, toMs: 400 },
      { text: "[_TT_120]", fromMs: 400, toMs: 400 },
    ];
    expect(sanitizeTokens(tokens, 10_000).map((t) => t.text)).toEqual(["動画"]);
  });

  it("時刻を単調にする（認識が前に戻ることがある）", () => {
    const tokens: AsrToken[] = [
      { text: "あ", fromMs: 1000, toMs: 1200 },
      { text: "い", fromMs: 500, toMs: 700 },
      { text: "う", fromMs: 1500, toMs: 1700 },
    ];
    const out = sanitizeTokens(tokens, 10_000);
    for (let i = 1; i < out.length; i++) {
      expect((out[i] as AsrToken).fromMs).toBeGreaterThanOrEqual((out[i - 1] as AsrToken).fromMs);
    }
  });

  it("音声の外に出た時刻を中に入れる", () => {
    const out = sanitizeTokens(
      [
        { text: "あ", fromMs: -500, toMs: 100 },
        { text: "い", fromMs: 9000, toMs: 99_999 },
      ],
      10_000,
    );
    expect((out[0] as AsrToken).fromMs).toBe(0);
    expect((out[1] as AsrToken).toMs).toBe(10_000);
  });

  it("NaN が来ても落ちない（fontSize と同じ事故を時刻でも防ぐ）", () => {
    const out = sanitizeTokens([{ text: "あ", fromMs: Number.NaN, toMs: Number.NaN }], 10_000);
    expect(Number.isFinite((out[0] as AsrToken).fromMs)).toBe(true);
    expect(Number.isFinite((out[0] as AsrToken).toMs)).toBe(true);
  });

  it("t_dtw が取れないトークンは 0 秒に飛ばさない", () => {
    const json = {
      transcription: [
        {
          offsets: { from: 5000, to: 6000 },
          timestamps: { from: "", to: "" },
          text: "テスト",
          tokens: [
            { t_dtw: -1, text: "テ", offsets: { from: 5000, to: 5300 }, timestamps: { from: "", to: "" }, id: 1, p: 0.9 },
            { t_dtw: 553, text: "スト", offsets: { from: 5300, to: 6000 }, timestamps: { from: "", to: "" }, id: 2, p: 0.9 },
          ],
        },
      ],
    };
    // 型は whisper の出力そのものなので、ここだけ寄せる
    const tokens = flattenTokens(json as unknown as Parameters<typeof flattenTokens>[0]);
    expect(tokens[0]?.fromMs).toBe(5000);
    // 次のトークンの t_dtw が終わりになる（区間が繋がる）
    expect(tokens[0]?.toMs).toBe(5530);
    expect(tokens[1]?.fromMs).toBe(5530);
  });
});

describe("テロップの割り方", () => {
  const speech = (texts: string[], msPerChar = 120): AsrToken[] => {
    let t = 0;
    return texts.map((text) => {
      const from = t;
      t += text.length * msPerChar;
      return { text, fromMs: from, toMs: t };
    });
  };

  it("上限の文字数を超えない", () => {
    const tokens = speech(["これは", "とても", "長い", "文章", "です", "ので", "割れます"]);
    const opts = OPTIONS(60_000);
    for (const chunk of groupTokens(sanitizeTokens(tokens, opts.audioDurationMs), opts)) {
      // トークン1つが上限を超える場合だけは超える（割れないので）
      expect(chunk.text.length).toBeLessThanOrEqual(opts.maxChars);
    }
  });

  it("上限の尺を超えない（視覚変化の間隔）", () => {
    const tokens = speech(["ゆっくり", "はなす", "ばあい"], 400);
    const opts = OPTIONS(60_000);
    for (const chunk of groupTokens(sanitizeTokens(tokens, opts.audioDurationMs), opts)) {
      expect(chunk.endMs - chunk.startMs).toBeLessThanOrEqual(opts.maxDurationMs);
    }
  });

  it("句点で必ず割る", () => {
    const tokens = speech(["これが", "一文目。", "これが", "二文目。"]);
    const chunks = groupTokens(sanitizeTokens(tokens, 60_000), OPTIONS(60_000));
    expect(chunks.map((c) => c.text)).toEqual(["これが一文目。", "これが二文目。"]);
  });

  it("読点はある程度たまってから割る（細切れにしない）", () => {
    const short = groupTokens(sanitizeTokens(speech(["あ、", "いうえお"]), 60_000), OPTIONS(60_000));
    expect(short.map((c) => c.text)).toEqual(["あ、いうえお"]);

    const long = groupTokens(
      sanitizeTokens(speech(["これはかなり長い、", "つづき"]), 60_000),
      OPTIONS(60_000),
    );
    expect(long.map((c) => c.text)).toEqual(["これはかなり長い、", "つづき"]);
  });

  it("1トークンが上限より長くても出す（消さない）", () => {
    const tokens = speech(["あ".repeat(40)]);
    const chunks = groupTokens(sanitizeTokens(tokens, 60_000), OPTIONS(60_000));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toHaveLength(40);
  });
});

describe("テロップの区間（音と合っていることの不変条件）", () => {
  const opts = OPTIONS(10_000);

  it("重ならない", () => {
    const chunks: TelopChunk[] = [
      { text: "あ", startMs: 0, endMs: 3000 },
      { text: "い", startMs: 1000, endMs: 4000 },
      { text: "う", startMs: 2000, endMs: 5000 },
    ];
    const out = normalizeSpans(chunks, opts);
    for (let i = 1; i < out.length; i++) {
      expect((out[i] as TelopChunk).startMs).toBeGreaterThanOrEqual((out[i - 1] as TelopChunk).endMs);
    }
  });

  it("音声の外に出ない", () => {
    const out = normalizeSpans([{ text: "あ", startMs: 9500, endMs: 30_000 }], opts);
    expect((out[0] as TelopChunk).endMs).toBeLessThanOrEqual(opts.audioDurationMs);
  });

  it("下限の尺を確保する（点滅させない）", () => {
    const out = normalizeSpans([{ text: "あ", startMs: 1000, endMs: 1050 }], opts);
    expect((out[0] as TelopChunk).endMs - (out[0] as TelopChunk).startMs).toBe(opts.minDurationMs);
  });

  it("下限より次の開始を優先する（重ねるより短くする）", () => {
    const out = normalizeSpans(
      [
        { text: "あ", startMs: 1000, endMs: 1050 },
        { text: "い", startMs: 1200, endMs: 2000 },
      ],
      opts,
    );
    expect((out[0] as TelopChunk).endMs).toBeLessThanOrEqual(1200);
    expect((out[1] as TelopChunk).startMs).toBeGreaterThanOrEqual((out[0] as TelopChunk).endMs);
  });

  it("幅が無くなったものは出さない（一瞬光るだけになる）", () => {
    const out = normalizeSpans(
      [
        { text: "あ", startMs: 5000, endMs: 9000 },
        { text: "い", startMs: 5000, endMs: 5000 },
      ],
      OPTIONS(9000),
    );
    expect(out).toHaveLength(1);
  });

  it("検査は自分の出力に文句を言わない", () => {
    const tokens: AsrToken[] = [];
    let t = 0;
    for (const text of "これはテストの文章です。テロップに割って時刻を付けます、そして確認します。".split("")) {
      tokens.push({ text, fromMs: t, toMs: t + 130 });
      t += 130;
    }
    const options = OPTIONS(t + 500);
    const chunks = toTelopChunks(tokens, options);
    expect(chunks.length).toBeGreaterThan(1);
    expect(checkTelopChunks(chunks, options)).toEqual([]);
  });

  it("文字を落とさない（認識した字はすべてテロップに入る）", () => {
    const source = "きょうのニュースです。リモーションの新しいバージョンが出ました、機能が増えています。";
    const tokens: AsrToken[] = [...source].map((char, i) => ({
      text: char,
      fromMs: i * 130,
      toMs: i * 130 + 130,
    }));
    const options = OPTIONS(source.length * 130 + 500);
    const chunks = toTelopChunks(tokens, options);
    expect(chunks.map((c) => c.text).join("")).toBe(source);
    expect(checkTelopChunks(chunks, { ...options, spokenText: source })).toEqual([]);
  });

  it("でたらめな時刻の並びでも不変条件を満たす", () => {
    // 疑似乱数。落ちたときに同じ入力を再現できるように固定の種から作る
    let seed = 20260918;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 40; round++) {
      const count = 5 + Math.floor(rand() * 60);
      const audioMs = 5000 + Math.floor(rand() * 60_000);
      const tokens: AsrToken[] = [];
      for (let i = 0; i < count; i++) {
        const from = Math.floor(rand() * audioMs * 1.2) - 500;
        tokens.push({
          text: "あいうえおかきくけこ。、".charAt(Math.floor(rand() * 12)),
          fromMs: from,
          toMs: from + Math.floor(rand() * 900) - 200,
        });
      }
      const options = OPTIONS(audioMs);
      const problems = checkTelopChunks(toTelopChunks(tokens, options), options);
      expect(problems, `round=${round}`).toEqual([]);
    }
  });

  it("壊れた区間はちゃんと落とす（検査が機能している）", () => {
    const options = OPTIONS(5000);
    const rules = checkTelopChunks(
      [
        { text: "あ", startMs: 0, endMs: 3000 },
        { text: "い", startMs: 1000, endMs: 1000 },
        { text: "う", startMs: 4000, endMs: 9000 },
      ],
      { ...options, spokenText: "あいうえお" },
    ).map((p) => p.rule);
    expect(rules).toContain("overlap");
    expect(rules).toContain("zero-length");
    expect(rules).toContain("out-of-range");
    expect(rules).toContain("too-long");
    expect(rules).toContain("text-lost");
  });

  it("その瞬間に出ているテロップは1枚だけ", () => {
    const chunks: TelopChunk[] = [
      { text: "あ", startMs: 0, endMs: 1000 },
      { text: "い", startMs: 1000, endMs: 2000 },
    ];
    expect(telopAt(chunks, 0)?.text).toBe("あ");
    expect(telopAt(chunks, 999)?.text).toBe("あ");
    // 境界は次のものに渡す（両方出る瞬間を作らない）
    expect(telopAt(chunks, 1000)?.text).toBe("い");
    expect(telopAt(chunks, 2000)).toBeUndefined();
  });
});

describe("音とテロップの突き合わせ", () => {
  const spans: Span[] = [
    { text: "きょうの", startMs: 0, endMs: 800 },
    { text: "ニュースです", startMs: 800, endMs: 2000 },
  ];

  it("文字ごとの時刻にほぐす", () => {
    const timed = toTimedChars(spans);
    expect(timed).toHaveLength(10);
    expect(timed[0]?.ms).toBeCloseTo(100, 5);
    expect(timed[9]?.ms).toBeCloseTo(1900, 5);
  });

  it("同じものなら一致率1・ズレ0", () => {
    const report = alignmentReport(spans, spans);
    expect(report.matchRate).toBe(1);
    expect(report.medianOffsetMs).toBe(0);
    expect(report.p95AbsOffsetMs).toBe(0);
  });

  it("全体が遅れていれば中央値に出る", () => {
    const shifted = spans.map((s) => ({ ...s, startMs: s.startMs + 250, endMs: s.endMs + 250 }));
    const report = alignmentReport(spans, shifted);
    expect(report.matchRate).toBe(1);
    expect(report.medianOffsetMs).toBeCloseTo(250, 5);
  });

  it("字が落ちれば一致率が下がる", () => {
    const dropped: Span[] = [
      { text: "きょうの", startMs: 0, endMs: 800 },
      { text: "ニュース", startMs: 800, endMs: 1600 },
    ];
    const report = alignmentReport(spans, dropped);
    expect(report.matched).toBe(8);
    expect(report.matchRate).toBeCloseTo(0.8, 5);
  });

  it("まったく違う文なら一致率が落ちる", () => {
    const report = alignmentReport(spans, [{ text: "ABCDEFGHIJ", startMs: 0, endMs: 2000 }]);
    expect(report.matchRate).toBe(0);
  });

  it("並びが入れ替わっていても対応した字だけ比べる", () => {
    const alignment = alignTimedChars(
      toTimedChars([{ text: "あいう", startMs: 0, endMs: 300 }]),
      toTimedChars([{ text: "あxう", startMs: 0, endMs: 300 }]),
    );
    expect(alignment.matched).toBe(2);
  });

  it("空でも落ちない", () => {
    expect(alignmentReport([], []).matchRate).toBe(0);
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(3);
  });
});

describe("ファイルの置き場所", () => {
  it("同名のファイルでもパスが違えば別の slug", () => {
    const a = slugForVideo("/Users/me/Movies/clip.mp4");
    const b = slugForVideo("/Users/me/Desktop/clip.mp4");
    expect(a).not.toBe(b);
    expect(a.startsWith("clip-")).toBe(true);
  });

  it("同じパスなら毎回同じ slug（作り直しても場所が変わらない）", () => {
    expect(slugForVideo("/tmp/a b.mp4")).toBe(slugForVideo("/tmp/a b.mp4"));
  });

  it("テロップのスキーマは終わりが先の区間を通さない", () => {
    const base = {
      video: "/tmp/a.mp4",
      videoDurationSec: 10,
      width: 1080,
      height: 1920,
      fps: 30,
      locale: "ja" as const,
      engine: "whisper.cpp",
      transcript: "あ",
      chunks: [{ text: "あ", startMs: 1000, endMs: 500 }],
    };
    expect(telopFileSchema.safeParse(base).success).toBe(false);
    expect(
      telopFileSchema.safeParse({ ...base, chunks: [{ text: "あ", startMs: 500, endMs: 1000 }] })
        .success,
    ).toBe(true);
  });
});

/**
 * 実ファイルを使う確認。自前で作った動画が out/ にあるときだけ回る。
 * **ここが「抽出した音声が本当に PCM になっているか」の最後の砦。**
 */
describe("手持ちの動画から音声を取り出す", () => {
  it.skipIf(!existsSync(samplePath))("映像の形を実測から取る", () => {
    const shape = videoShape(readMp4(samplePath));
    expect(shape.width).toBeGreaterThan(0);
    expect(shape.height).toBeGreaterThan(0);
    expect(shape.fps).toBeGreaterThan(0);
    expect(shape.durationSec).toBeGreaterThan(1);
  });

  it.skipIf(!existsSync(samplePath))(
    "16kHz モノラル PCM になり、尺が映像と一致する",
    async () => {
      const shape = videoShape(readMp4(samplePath));
      const fmt = await extractPcmWav({
        videoPath: samplePath,
        outPath: join(WORK_DIR, "tests", "extract.wav"),
      });
      expect(fmt.audioFormat).toBe(1);
      expect(fmt.sampleRate).toBe(WHISPER_SAMPLE_RATE);
      expect(fmt.channels).toBe(1);
      expect(fmt.bitsPerSample).toBe(16);
      // ここが 1/5 になっていたのが最初のバグ
      expect(fmt.durationSec).toBeCloseTo(shape.durationSec, 1);
    },
    120_000,
  );

  it.skipIf(!existsSync(samplePath))("無音でないことを先に見る", async () => {
    const outPath = join(WORK_DIR, "tests", "level.wav");
    await extractPcmWav({ videoPath: samplePath, outPath });
    const level = audioLevel(outPath);
    expect(level.rms).toBeGreaterThan(SILENCE_RMS);
    expect(level.peak).toBeLessThanOrEqual(1);
  }, 120_000);

  it("無音の WAV は無音と分かる（認識に数分かけない）", () => {
    const path = join(WORK_DIR, "tests", "silent.wav");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, silentWav(0.5, WHISPER_SAMPLE_RATE));
    const level = audioLevel(path);
    expect(level.rms).toBe(0);
    expect(level.rms).toBeLessThan(SILENCE_RMS);
  });

  it.skipIf(!existsSync(samplePath))("絶対パス以外は受けない", async () => {
    await expect(
      extractPcmWav({ videoPath: "out/x/tiktok.mp4", outPath: join(WORK_DIR, "tests", "x.wav") }),
    ).rejects.toThrow(/絶対パス/);
  });
});
