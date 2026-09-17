/**
 * 仮の BGM を作る。**本番の音源ではない。**
 *
 * BGM の調達方法（Suno / ロイヤリティフリー音源）は未決事項（plan.md 9節）。
 * 決まるまでの間、無音でレンダー結果を判断すると音量バランスの確認ができないので、
 * ループする単純なパッドを生成して置いておく。
 *
 *   npx tsx scripts/dev/make-placeholder-bgm.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_BGM_DIR } from "../lib/paths.ts";

const SAMPLE_RATE = 24_000;
const DURATION_SEC = 16;
/** ループの継ぎ目を無くすため、周期が尺にちょうど収まる周波数だけ使う */
const CYCLES = [1408, 1760, 2112]; // 16秒でそれぞれ整数回 → 88Hz / 110Hz / 132Hz（A2 の和音）

const main = (): void => {
  const samples = SAMPLE_RATE * DURATION_SEC;
  const pcm = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i++) {
    const t = i / samples; // 0..1
    let value = 0;
    for (const [index, cycles] of CYCLES.entries()) {
      const phase = 2 * Math.PI * cycles * t;
      // 高い音を弱くする
      value += Math.sin(phase) / (index + 2);
    }
    // 4秒周期のゆるい強弱。ループ境界で連続になる
    const swell = 0.75 + 0.25 * Math.sin(2 * Math.PI * 4 * t);
    const sample = Math.round(value * swell * 0.18 * 32767);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  mkdirSync(PUBLIC_BGM_DIR, { recursive: true });
  const out = join(PUBLIC_BGM_DIR, "placeholder-pad.wav");
  writeFileSync(out, Buffer.concat([header, pcm]));
  console.log(`[bgm] ${out}（${DURATION_SEC}秒 / ループ可）`);
};

main();
