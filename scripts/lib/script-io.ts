import { scriptSchema, type Script } from "../../src/schema/script.ts";
import { timelineSchema, type Timeline } from "../../src/schema/timeline.ts";
import { publishSchema, type Publish } from "../../src/schema/publish.ts";
import { exists, parseOrThrow, readJson, writeJson } from "./io.ts";
import { propsPath, publishPath, scriptPath, timelinePath } from "./paths.ts";

export const scriptExists = (id: string): boolean => exists(scriptPath(id));

export const loadScript = (id: string): Script =>
  parseOrThrow(scriptSchema, readJson(scriptPath(id)), `content/scripts/${id}.json`);

export const timelineExists = (id: string): boolean => exists(timelinePath(id));

export const loadTimeline = (id: string): Timeline =>
  parseOrThrow(timelineSchema, readJson(timelinePath(id)), `content/timeline/${id}.json`);

export const saveTimeline = (timeline: Timeline): void =>
  writeJson(timelinePath(timeline.id), timeline);

export const publishExists = (id: string): boolean => exists(publishPath(id));

export const loadPublish = (id: string): Publish =>
  parseOrThrow(publishSchema, readJson(publishPath(id)), `content/publish/${id}.json`);

export const savePublish = (publish: Publish): void => writeJson(publishPath(publish.id), publish);

/**
 * レンダー props。Remotion の calculateMetadata が
 * staticFile("props/<id>.json") から fetch する。
 * バンドル側で fs を触らずに済むのでこの形にしている。
 */
export type RenderPropsFile = { script: Script; timeline: Timeline };

export const saveRenderProps = (script: Script, timeline: Timeline): void =>
  writeJson(propsPath(script.id), { script, timeline } satisfies RenderPropsFile);

export const renderPropsExist = (id: string): boolean => exists(propsPath(id));
