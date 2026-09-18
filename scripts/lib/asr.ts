/**
 * whisper.cpp を呼ぶ（モードB）。
 *
 * **ここが唯一の音声認識の呼び口。** 認識結果はトークン単位の時刻つきで返し、
 * テロップへのまとめ方は `src/lib/telop.ts`（純関数）に任せる。
 *
 * 初回は github から whisper.cpp を取ってビルドし、モデルを落とす（数分・数GB）。
 * 以後はローカルだけで動く。**落ちたときに何をすればいいか言うのが仕事の半分。**
 */
import { downloadWhisperModel, installWhisperCpp, transcribe } from "@remotion/install-whisper-cpp";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../config/pipeline.ts";
import type { AsrToken } from "../../src/lib/telop.ts";
import { CACHE_DIR } from "./paths.ts";
import { log } from "./log.ts";

export const WHISPER_DIR = join(CACHE_DIR, "whisper.cpp");
export const WHISPER_MODEL_DIR = join(CACHE_DIR, "whisper-models");

export type Transcription = {
  /** 認識した全文（テロップの連結と一致するべきもの） */
  text: string;
  tokens: AsrToken[];
  engine: string;
};

const HELP_INSTALL =
  "whisper.cpp の用意に失敗した。\n" +
  "  - 初回はネットワークが必要（github からソース、Hugging Face からモデル）\n" +
  "  - ビルドに cmake と C++ コンパイラが必要（mac: xcode-select --install）\n" +
  `  - タグが無いと clone は失敗する。config/pipeline.ts の caption.whisperCppVersion（現在 ${config.caption.whisperCppVersion}）を実在するタグに直す\n` +
  `  - やり直すときは ${WHISPER_DIR} を消す`;

/** whisper.cpp とモデルを用意する。すでにあれば何もしない */
export const ensureWhisper = async (): Promise<void> => {
  try {
    const installed = await installWhisperCpp({
      to: WHISPER_DIR,
      version: config.caption.whisperCppVersion,
      printOutput: true,
    });
    if (!installed.alreadyExisted) {
      log.ok(`whisper.cpp を用意した（${WHISPER_DIR}）`);
    }
  } catch (error) {
    throw new Error(`${HELP_INSTALL}\n\n${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const model = await downloadWhisperModel({
      model: config.caption.model,
      folder: WHISPER_MODEL_DIR,
      printOutput: true,
    });
    if (!model.alreadyExisted) {
      log.ok(`モデル ${config.caption.model} を落とした（${WHISPER_MODEL_DIR}）`);
    }
  } catch (error) {
    throw new Error(
      `モデル ${config.caption.model} を落とせなかった（${WHISPER_MODEL_DIR}）。\n` +
        "  - ネットワークを確認する\n" +
        "  - 容量を確認する（large 系は 1〜3GB）\n" +
        `  - 小さいモデルで試す: config/pipeline.ts の caption.model を "small" にする\n\n` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/** 用意できているか（テストやレンダーだけしたいときに認識を飛ばす判定） */
export const whisperReady = (): boolean =>
  existsSync(WHISPER_DIR) && existsSync(WHISPER_MODEL_DIR);

/**
 * 16kHz モノラル PCM の WAV を認識する。
 * `tokenLevelTimestamps: true` にしないとトークン単位の時刻（t_dtw）が来ない。
 * **セグメント単位の時刻だけではテロップは作れない**（1つが数秒になる）。
 */
export const transcribeWav = async (wavPath: string): Promise<Transcription> => {
  await ensureWhisper();

  const json = await transcribe({
    inputPath: wavPath,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: config.caption.whisperCppVersion,
    model: config.caption.model,
    modelFolder: WHISPER_MODEL_DIR,
    tokenLevelTimestamps: true,
    language: config.caption.language,
    printOutput: false,
  });

  return {
    text: json.transcription.map((item) => item.text).join("").trim(),
    tokens: flattenTokens(json),
    engine: `whisper.cpp ${config.caption.whisperCppVersion} / ${config.caption.model}`,
  };
};

type WhisperJson = Awaited<ReturnType<typeof transcribe<true>>>;

/**
 * セグメントの入れ子をトークンの一列にする。
 *
 * `t_dtw` は 10ms 単位で、取れないと -1 が入る。**-1 をそのまま使うと
 * テロップが 0秒に飛ぶ**ので、セグメントの区間で埋める。
 */
export const flattenTokens = (json: WhisperJson): AsrToken[] => {
  const out: AsrToken[] = [];
  for (const item of json.transcription) {
    const tokens = item.tokens ?? [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) {
        continue;
      }
      const dtw = token.t_dtw >= 0 ? token.t_dtw * 10 : null;
      const from = dtw ?? token.offsets?.from ?? item.offsets.from;
      const nextDtw = tokens[i + 1]?.t_dtw;
      const to =
        nextDtw !== undefined && nextDtw >= 0
          ? nextDtw * 10
          : (token.offsets?.to ?? item.offsets.to);
      out.push({ text: token.text, fromMs: from, toMs: Math.max(to, from) });
    }
  }
  return out;
};
