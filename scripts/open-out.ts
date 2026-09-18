/**
 * 出力フォルダを OS のファイラで開く。
 *
 *   npm run open                      直近に作ったものを開く
 *   npm run open -- --topic <id>
 *
 * 目視確認（実機へ転送・音ズレの確認）のたびにパスを打つのが面倒なので用意した。
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { OUT_DIR, outDir } from "./lib/paths.ts";

/** OS ごとのファイラ */
const opener = (): string => {
  switch (process.platform) {
    case "darwin":
      return "open";
    case "win32":
      return "explorer";
    default:
      return "xdg-open";
  }
};

/** --topic 省略時は out/ の中でいちばん新しいディレクトリ */
const latestTopic = (): string | undefined => {
  if (!existsSync(OUT_DIR)) {
    return undefined;
  }
  return readdirSync(OUT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, at: statSync(join(OUT_DIR, e.name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0]?.name;
};

export const openOut = (id: string): void => {
  const dir = outDir(id);
  if (!existsSync(dir)) {
    throw new Error(`${dir} が無い。先に npm run today を回す`);
  }
  for (const file of readdirSync(dir).sort()) {
    log.info(file);
  }
  const child = spawn(opener(), [dir], { detached: true, stdio: "ignore" });
  // ファイラが無い環境（コンテナ・CI）では落とさずパスだけ出す
  child.on("error", () => {
    log.warn(`${opener()} が無いので開けなかった。パスはここ:`);
    console.log(`  ${dir}`);
  });
  child.on("spawn", () => {
    child.unref();
    log.ok(`${dir} を開いた`);
  });
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args) ?? latestTopic();
  if (!id) {
    throw new Error("out/ に何も無い。先に npm run today を回す");
  }
  openOut(id);
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
