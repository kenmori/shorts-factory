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

/**
 * 音声合成をやり直す必要があるか。
 *
 * 台本の更新時刻だけを見ていると、**エンジンを切り替えたときに取り残される。**
 * mock で配線を確認したあと VOICEVOX に切り替えても、タイムラインが台本より
 * 新しいままなので合成が飛ばされ、無音の動画が投稿前ゲートに落ち続ける。
 */
export const needsSynthesis = (input: {
  force: boolean;
  scriptAt: number;
  timelineAt: number;
  propsAt: number;
  /** 既存のタイムラインを作ったエンジン。タイムラインが無ければ null */
  timelineEngine: string | null;
  wantEngine: string;
}): { needed: boolean; reason: "force" | "no-timeline" | "script-changed" | "engine-changed" | null } => {
  if (input.force) {
    return { needed: true, reason: "force" };
  }
  if (input.timelineAt === 0 || input.propsAt === 0 || input.timelineEngine === null) {
    return { needed: true, reason: "no-timeline" };
  }
  if (input.timelineEngine !== input.wantEngine) {
    return { needed: true, reason: "engine-changed" };
  }
  if (input.timelineAt < input.scriptAt || input.propsAt < input.scriptAt) {
    return { needed: true, reason: "script-changed" };
  }
  return { needed: false, reason: null };
};
