/** 工程を飛ばすための更新時刻の比較。冪等かつ再開可能にするための道具 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export const mtime = (path: string): number => (existsSync(path) ? statSync(path).mtimeMs : 0);

/** ディレクトリ配下でいちばん新しい更新時刻 */
export const newestMtime = (dir: string): number => {
  if (!existsSync(dir)) {
    return 0;
  }
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs);
  }
  return newest;
};

/** out が inputs すべてより新しいか */
export const isFresh = (out: string, inputs: number[]): boolean => {
  const outAt = mtime(out);
  if (outAt === 0) {
    return false;
  }
  return inputs.every((at) => at <= outAt);
};

export type SynthesisReason =
  | "force"
  | "no-timeline"
  | "script-changed"
  | "engine-changed"
  | "layout-changed"
  | null;

/**
 * 音声合成をやり直す必要があるか。
 *
 * **タイムラインが何に依存しているかを全部並べる。** 台本の更新時刻だけを
 * 見ていると取り残される。実際に2回踏んだ:
 *
 *   - エンジンを mock から VOICEVOX に戻しても合成が飛ばされ、無音のまま
 *   - config の hookOverlaySec を変えても合成が飛ばされ、冒頭の配置が古いまま
 *
 * 依存しているのは「台本」「エンジン」「config と合成コード（= 配置の決め方）」。
 */
export const needsSynthesis = (input: {
  force: boolean;
  scriptAt: number;
  timelineAt: number;
  propsAt: number;
  /** 既存のタイムラインを作ったエンジン。タイムラインが無ければ null */
  timelineEngine: string | null;
  wantEngine: string;
  /**
   * 配置を決めるもの（config/pipeline.ts と scripts/synthesize.ts）の
   * いちばん新しい更新時刻。尺・フックの重なり・末尾余白がここで決まる
   */
  layoutAt: number;
}): { needed: boolean; reason: SynthesisReason } => {
  if (input.force) {
    return { needed: true, reason: "force" };
  }
  if (input.timelineAt === 0 || input.propsAt === 0 || input.timelineEngine === null) {
    return { needed: true, reason: "no-timeline" };
  }
  if (input.timelineEngine !== input.wantEngine) {
    return { needed: true, reason: "engine-changed" };
  }
  const oldest = Math.min(input.timelineAt, input.propsAt);
  if (oldest < input.scriptAt) {
    return { needed: true, reason: "script-changed" };
  }
  if (oldest < input.layoutAt) {
    return { needed: true, reason: "layout-changed" };
  }
  return { needed: false, reason: null };
};
