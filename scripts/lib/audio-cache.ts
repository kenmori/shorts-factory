/**
 * 内容アドレスキャッシュ。**「コマンド一つ」の成否はここで決まる。**
 *
 * キャッシュがないとテンプレ調整のたびに音声が再生成される。1本を何十回も
 * レンダーするフェーズでそれが乗ると、確実にコマンドを使わなくなって手作業に戻る。
 *
 * キーに "|" を含めない（キーは "|" を除去したテキスト）。
 * そうすれば字幕の割れ方を何度調整しても音声は再生成されない。
 *
 * --offline でキャッシュミスしたら**黙って生成せずエラーで落とす。**
 * ここで勝手にAPIを叩くとオプションの意味がなくなる。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_CACHE_DIR } from "./paths.ts";
import { sha256 } from "./hash.ts";
import type { CacheFn } from "../tts/types.ts";

/** キーとエンジン署名の区切り。テキストにもエンジン署名にも現れない文字列 */
const SEP = "::signature::";

export type CacheStats = { hit: number; miss: number };

export type AudioCache = {
  fn: CacheFn;
  stats: CacheStats;
};

export const cacheDigest = (key: string, signature: string): string =>
  sha256(`${key}${SEP}${signature}`);

export const createAudioCache = (opts: {
  signature: string;
  ext: string;
  offline: boolean;
}): AudioCache => {
  const stats: CacheStats = { hit: 0, miss: 0 };
  mkdirSync(AUDIO_CACHE_DIR, { recursive: true });

  const fn: CacheFn = async <T>(
    key: string,
    produce: () => Promise<{ audio: Buffer; meta: T }>,
  ): Promise<{ audio: Buffer; meta: T }> => {
    const digest = cacheDigest(key, opts.signature);
    const audioPath = join(AUDIO_CACHE_DIR, `${digest}.${opts.ext}`);
    const metaPath = join(AUDIO_CACHE_DIR, `${digest}.json`);

    if (existsSync(audioPath) && existsSync(metaPath)) {
      stats.hit++;
      return {
        audio: readFileSync(audioPath),
        meta: JSON.parse(readFileSync(metaPath, "utf8")) as T,
      };
    }

    if (opts.offline) {
      throw new Error(
        [
          `--offline だがキャッシュに無い: "${key.slice(0, 24)}..."`,
          "仕様どおり、黙って生成せずここで止めた。",
          "一度ネットワーク（または VOICEVOX ENGINE）を繋いで --offline なしで実行する。",
        ].join("\n"),
      );
    }

    stats.miss++;
    const produced = await produce();
    writeFileSync(audioPath, produced.audio);
    writeFileSync(metaPath, JSON.stringify(produced.meta ?? null));
    return produced;
  };

  return { fn, stats };
};

/** public/ へ置くときのファイル名（= 内容のハッシュ）。同じ文面なら1ファイルで済む */
export const contentName = (key: string, signature: string, ext: string): string =>
  `${cacheDigest(key, signature).slice(0, 16)}.${ext}`;
