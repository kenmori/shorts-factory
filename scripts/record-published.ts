/**
 * 投稿した記録。**dedupe と変化軸のローテートはこの記録で動く。**
 *
 *   npm run record -- --topic <id>
 *
 * content/published.json に (entity, version, angle) と変化軸を書き、
 * topics.yaml の status を published にする。
 * 投稿してから叩く（レンダーしただけのものを記録すると dedupe が嘘になる）。
 */
import { deriveVariant } from "../src/design/variants.ts";
import { getTopic, parseArgs } from "./lib/args.ts";
import { log, runMain } from "./lib/log.ts";
import { isEntry } from "./lib/main.ts";
import { recordPublished } from "./lib/published.ts";
import { loadScript } from "./lib/script-io.ts";
import { markTopic, slugFromId } from "./lib/topics.ts";

export const recordTopic = (id: string): void => {
  const script = loadScript(id);
  const variant = deriveVariant(id);
  recordPublished({
    id,
    entity: script.entity,
    version: script.version,
    angle: script.angle,
    shelfLife: script.shelfLife,
    variantKey: variant.key,
    recordedAt: new Date().toISOString(),
  });
  markTopic(slugFromId(id), "published", id);
  log.ok(`content/published.json に記録した（${script.entity} / ${script.angle} / ${variant.key}）`);
  log.info("次は投稿2時間後に content/metrics.yaml へ完了率と離脱点を書く");
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const id = getTopic(args);
  if (!id) {
    throw new Error("--topic <id> を指定する");
  }
  recordTopic(id);
};

if (isEntry(import.meta.url)) {
  void runMain(main);
}
