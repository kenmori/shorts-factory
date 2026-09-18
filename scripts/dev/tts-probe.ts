/**
 * TTS の返り値を**実際に目で見る**ための道具（plan.md M2 の最初の項目）。
 *
 *   npm run tts:probe                          既定の50文字を投げる
 *   npm run tts:probe -- --text "好きな原稿"
 *   npm run tts:probe -- --topic <id>          台本の第1セクションで試す
 *
 * 見るのは3点。**ここが想定と違ったら設計をやり直す。**
 *
 *   1. 読み（kana）。「Remotion」「4.0」がどう読まれるか。
 *      崩れるなら原稿にカナで書く（prompts/script.md のルール）
 *   2. モーラ音長の合計と WAV の実測値の差。
 *      ここが合っていることが「チャンクごとに合成して並べれば
 *      字幕の境界が構造的に確定する」という設計の前提
 *   3. 1チャンクの尺。2秒を超えると視覚変化の lint に落ちるので、
 *      台本を書く前に「何文字で何秒か」を掴んでおく
 *
 * 音は out/tts-probe/ に書き出すので聞いて確かめる。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../config/pipeline.ts";
import { toChunks } from "../../src/schema/script.ts";
import { getString, getTopic, parseArgs } from "../lib/args.ts";
import { log, runMain } from "../lib/log.ts";
import { loadScript } from "../lib/script-io.ts";
import { OUT_DIR } from "../lib/paths.ts";
import { wavDurationSec } from "../lib/wav.ts";
import {
  audioQuery,
  durationFromQuery,
  resolveSpeakerId,
  synthesizeQuery,
} from "../tts/voicevox.ts";

/**
 * 既定の原稿（50文字）。
 * 英語の製品名・数字・単位を**わざと混ぜてある**（正規化で崩れるのはここなので）。
 */
const DEFAULT_TEXT =
  "Remotion 4.0 なら|3つの媒体に|同じ台本から書き出せます|所要は約2分です";

const pad = (s: string | number, n: number): string => String(s).padStart(n);

const main = async (): Promise<void> => {
  const args = parseArgs();
  const topic = getTopic(args);
  const text =
    getString(args, "text") ??
    (topic ? loadScript(topic).sections[0]?.narration : undefined) ??
    DEFAULT_TEXT;

  if (config.tts !== "voicevox") {
    log.warn(`config の tts は ${config.tts} だが、このスクリプトは VOICEVOX 専用`);
  }

  const chunks = toChunks(text);
  const vv = config.voicevox;
  log.step(`VOICEVOX に投げる（${chunks.length}チャンク）`);
  log.info(`endpoint: ${vv.endpoint}`);
  // 話者は名前で指定して ENGINE から id を引く（番号を推測で書かない）
  const speakerId = await resolveSpeakerId();
  log.info(`話者: ${vv.speakerName} / ${vv.styleName ?? "ノーマル"}（style id=${speakerId}）`);
  log.blank();

  const dir = join(OUT_DIR, "tts-probe");
  mkdirSync(dir, { recursive: true });

  let moraTotal = 0;
  let wavTotal = 0;
  let worst = 0;

  for (const [i, chunk] of chunks.entries()) {
    const query = await audioQuery(chunk);
    const audio = await synthesizeQuery(query);

    const fromMora = durationFromQuery(query);
    const measured = wavDurationSec(audio);
    const diff = measured - fromMora;
    moraTotal += fromMora;
    wavTotal += measured;
    worst = Math.max(worst, Math.abs(diff));

    const file = join(dir, `${String(i + 1).padStart(2, "0")}.wav`);
    writeFileSync(file, audio);

    const chars = [...chunk].length;
    console.log(`  [${pad(i + 1, 2)}] ${chunk}`);
    console.log(
      `       ${pad(chars, 2)}文字 / モーラ計 ${fromMora.toFixed(3)}秒 / WAV 実測 ${measured.toFixed(3)}秒 / 差 ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}秒` +
        (measured > config.maxVisualStillSec ? "  <-- 2秒超（lint に落ちる）" : ""),
    );
    // 読みの確認。ここが崩れるなら原稿にカナで書く
    console.log(`       読み: ${query.kana ?? "(kana が返っていない)"}`);
    console.log(`       ${(chars / measured).toFixed(1)}文字/秒`);
  }

  log.blank();
  log.step("まとめ");
  log.info(`モーラ音長の合計: ${moraTotal.toFixed(3)}秒`);
  log.info(`WAV の実測合計:   ${wavTotal.toFixed(3)}秒`);
  log.info(`1チャンクあたりの最大のズレ: ${worst.toFixed(3)}秒`);
  log.info(`速度: ${([...text.split("|").join("")].length / wavTotal).toFixed(1)}文字/秒`);
  log.blank();

  // 設計の前提が崩れていないかの判定。閾値は「字幕が1フレームずれない」程度
  const perFrame = 1 / config.fps;
  if (worst > perFrame) {
    log.warn(
      `モーラ音長と実測のズレが1フレーム（${perFrame.toFixed(3)}秒）を超えている。` +
        "チャンクごとの合成では実測値を使っているので字幕はずれないが、" +
        "モーラ音長から尺を予測する処理を足すときはこの差を前提にする",
    );
  } else {
    log.ok("モーラ音長と実測はフレーム以下で一致。チャンク単位の設計の前提は成立している");
  }

  // --- 台本を書くときに必要な数値を出す ---
  const totalChars = [...text.split("|").join("")].length;
  const silencePerChunk = vv.prePhonemeLength + vv.postPhonemeLength;
  // チャンクごとの前後無音を除いた、正味の発話速度
  const secPerChar = (wavTotal - chunks.length * silencePerChunk) / totalChars;

  const [min, max] = config.durationRangeSec;
  // 典型的な形（4セクション + outro）の末尾余白を引く
  const tails = config.sectionTailSec * 5;
  const budget = (target: number): number => target - config.hookDurationSec - tails;
  /** 尺 target 秒に収まる文字数。チャンク長 perChunk 文字で割った場合 */
  const charsFor = (target: number, perChunk: number): number =>
    Math.round(budget(target) / (secPerChar + silencePerChunk / perChunk));

  const limit = (allowance: number): number =>
    Math.floor((allowance - silencePerChunk) / secPerChar);

  log.step("台本を書くときの目安（この話者・この速度での実測値）");
  log.info(`正味の発話速度: ${(1 / secPerChar).toFixed(1)}文字/秒（前後の無音 ${silencePerChunk}秒/チャンクを除く）`);
  log.info(`1チャンクの上限: ${limit(config.maxVisualStillSec)}文字（視覚変化 ${config.maxVisualStillSec}秒の lint）`);
  log.info(
    `セクション末尾のチャンク: ${limit(config.maxVisualStillSec - config.sectionTailSec)}文字（末尾余白 ${config.sectionTailSec}秒と合算されるため）`,
  );
  log.info(
    `ナレーション全体: ${charsFor(min, 9)}〜${charsFor(max, 9)}文字（${min}〜${max}秒 / 9文字のチャンクで割った場合）`,
  );
  log.blank();
  log.info(`音声: ${dir}/  ← 聞いて確かめる`);
  log.info("読みが崩れていたら、原稿にカナで書く（prompts/script.md のルール）");
};

void runMain(main);
