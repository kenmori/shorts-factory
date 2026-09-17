/**
 * 台本の検証。**両経路（manual / api）で共通。** 落ちたら fulfill に戻る。
 *
 * zod（構造）+ lint（3.5節のリテンション設計）+ dedupe（3つ組のハード判定）。
 * ここを通った content/scripts/<id>.json が存在することが build の契約で、
 * どう作ったかは問わない。
 */
import { getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { loadScript, scriptExists } from "./lib/script-io.ts";
import { scriptPath } from "./lib/paths.ts";
import { hasError, lintScript, type Finding } from "./lint-script.ts";

export const printFindings = (findings: Finding[]): void => {
  for (const f of findings) {
    const line = `[${f.rule}] ${f.message}`;
    if (f.level === "error") {
      log.fail(line);
    } else {
      log.warn(line);
    }
  }
};

/** 例外を投げずに結果を返す（today から呼ぶため） */
export const verifyScript = (id: string): { ok: boolean; findings: Finding[] } => {
  if (!scriptExists(id)) {
    throw new Error(`${scriptPath(id)} が無い`);
  }
  const script = loadScript(id); // zod。ここで落ちたら構造の問題
  const findings = lintScript(script);
  return { ok: !hasError(findings), findings };
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  log.step(`台本の検証: ${id}`);
  const { ok, findings } = verifyScript(id);
  printFindings(findings);
  if (!ok) {
    throw new Error("lint が通っていない。上の error を直してから再実行する");
  }
  log.ok(`検証 OK（warn ${findings.length}件）`);
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
