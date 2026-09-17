import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/**
 * そのファイルが `node`（tsx）から直接起動されたか。
 * 各スクリプトは「関数として import できる」かつ「単体で叩ける」両方にする。
 * today.ts が工程を関数で呼び回すため。
 */
export const isEntry = (moduleUrl: string): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(resolve(entry));
  } catch {
    return false;
  }
};
