import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const CONTENT_DIR = join(ROOT, "content");
export const SCRIPTS_DIR = join(CONTENT_DIR, "scripts");
export const TIMELINE_DIR = join(CONTENT_DIR, "timeline");
export const CAPTIONS_DIR = join(CONTENT_DIR, "captions");
export const PUBLISH_DIR = join(CONTENT_DIR, "publish");
export const TOPICS_FILE = join(CONTENT_DIR, "topics.yaml");
export const PUBLISHED_FILE = join(CONTENT_DIR, "published.json");
export const METRICS_FILE = join(CONTENT_DIR, "metrics.yaml");

export const WORK_DIR = join(ROOT, ".work");
export const CACHE_DIR = join(ROOT, ".cache");
export const AUDIO_CACHE_DIR = join(CACHE_DIR, "audio");
export const SCRIPT_CACHE_DIR = join(CACHE_DIR, "script");

export const PUBLIC_DIR = join(ROOT, "public");
export const PUBLIC_AUDIO_DIR = join(PUBLIC_DIR, "audio");
export const PUBLIC_PROPS_DIR = join(PUBLIC_DIR, "props");
export const PUBLIC_FONT_DIR = join(PUBLIC_DIR, "fonts");
export const PUBLIC_BGM_DIR = join(PUBLIC_DIR, "bgm");

export const OUT_DIR = join(ROOT, "out");
export const SNAPSHOT_DIR = join(ROOT, "snapshots");
export const PROMPTS_DIR = join(ROOT, "prompts");

export const scriptPath = (id: string): string => join(SCRIPTS_DIR, `${id}.json`);
export const timelinePath = (id: string): string => join(TIMELINE_DIR, `${id}.json`);
export const captionsPath = (id: string): string => join(CAPTIONS_DIR, `${id}.json`);
export const publishPath = (id: string): string => join(PUBLISH_DIR, `${id}.json`);
export const propsPath = (id: string): string => join(PUBLIC_PROPS_DIR, `${id}.json`);
export const narrationPath = (id: string): string => join(PUBLIC_AUDIO_DIR, id, "narration.wav");
export const workDir = (id: string): string => join(WORK_DIR, id);
export const outDir = (id: string): string => join(OUT_DIR, id);
