/**
 * fulfill（台本を作る工程）の api 経路。**切替はここだけ。**
 *
 * 契約は「検証を通った content/scripts/<id>.json が存在する」こと。
 * どう作ったかは問わないので、manual 経路ではこのスクリプトは no-op になる。
 *
 * Claude Code は Node から呼べる関数ではない（人間がセッションに入る工程なので
 * エントリポイントが無い）。だから接合点は LLM 呼び出しではなく**ファイル**にしてある。
 *
 * M4.5 で実装する。プロンプトは prompts/script.md を送る（TS の文字列に埋めない）。
 * ここを書くまで LLM を呼ぶコードはリポジトリに入れない（plan.md 0節）。
 */
import { config } from "../config/pipeline.ts";
import { getTopic, parseArgs } from "./lib/args.ts";
import { Halt, log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { scriptExists } from "./lib/script-io.ts";

export const generateScript = async (id: string): Promise<void> => {
  if (config.scriptSource === "manual") {
    log.skip("scriptSource=manual なので script:generate は何もしない");
    return;
  }
  if (scriptExists(id)) {
    log.skip(`content/scripts/${id}.json は既にある`);
    return;
  }
  throw new Halt("script:generate（api 経路）は未実装。plan.md の M4.5", [
    "今は config の scriptSource を manual にして Claude Code で書く:",
    `  /script ${id}`,
  ]);
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  await generateScript(id);
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
