/**
 * Remotion のバンドルとレンダーの共通部分。
 *
 * バンドルは1回作って使い回す（媒体3本を別々にバンドルすると3倍待つ）。
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { join } from "node:path";
import { config, type Platform } from "../../config/pipeline.ts";
import { CACHE_DIR, ROOT } from "./paths.ts";
import { findBrowser } from "./browser.ts";
import { log } from "./log.ts";

const ENTRY = join(ROOT, "src", "index.ts");

export type Bundled = { serveUrl: string };

let cached: Promise<Bundled> | null = null;

export const bundleOnce = (): Promise<Bundled> => {
  if (cached) {
    return cached;
  }
  cached = (async () => {
    log.step("バンドル");
    const serveUrl = await bundle({
      entryPoint: ENTRY,
      outDir: join(CACHE_DIR, "bundle"),
      publicDir: join(ROOT, "public"),
      onProgress: () => undefined,
    });
    log.ok("バンドル完了");
    return { serveUrl };
  })();
  return cached;
};

type Composition = Awaited<ReturnType<typeof selectComposition>>;

export type Selected = {
  serveUrl: string;
  composition: Composition;
  inputProps: Record<string, unknown>;
};

const browser = findBrowser();

export const select = async (topicId: string, platform: Platform): Promise<Selected> => {
  const { serveUrl } = await bundleOnce();
  const inputProps = { topicId, platform };
  const composition = await selectComposition({
    serveUrl,
    id: `NewsDigest-${platform}`,
    inputProps,
    browserExecutable: browser.executable,
    chromeMode: browser.chromeMode,
  });
  return { serveUrl, composition, inputProps };
};

export const renderVideo = async (opts: {
  topicId: string;
  platform: Platform;
  outPath: string;
  frameRange?: [number, number];
  onProgress?: (ratio: number) => void;
}): Promise<void> => {
  const { serveUrl, composition, inputProps } = await select(opts.topicId, opts.platform);
  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: opts.outPath,
    inputProps,
    browserExecutable: browser.executable,
    chromeMode: browser.chromeMode,
    frameRange: opts.frameRange,
    // 縦型は幅が狭いのでビットレートより解像度維持を優先する
    crf: 18,
    imageFormat: "jpeg",
    jpegQuality: 95,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  });
};

export const renderFrame = async (opts: {
  topicId: string;
  platform: Platform;
  frame: number;
  outPath: string;
  /** 1 未満にすると縮小して書き出す。スナップショットの容量対策 */
  scale?: number;
}): Promise<void> => {
  const { serveUrl, composition, inputProps } = await select(opts.topicId, opts.platform);
  await renderStill({
    serveUrl,
    composition,
    frame: opts.frame,
    output: opts.outPath,
    inputProps,
    browserExecutable: browser.executable,
    chromeMode: browser.chromeMode,
    imageFormat: "png",
    scale: opts.scale ?? 1,
    overwrite: true,
  });
};

export const platformsFromArg = (value: string | undefined): Platform[] => {
  if (value === undefined) {
    return [...config.platforms];
  }
  const requested = value.split(",").map((s) => s.trim());
  const unknown = requested.filter((p) => !config.platforms.includes(p as Platform));
  if (unknown.length > 0) {
    throw new Error(`知らない媒体: ${unknown.join(", ")}（${config.platforms.join(" / ")}）`);
  }
  return requested as Platform[];
};
