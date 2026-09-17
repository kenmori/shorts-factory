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
