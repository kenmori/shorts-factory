/**
 * モードBのファイル配置。
 *
 * **動画の絶対パスから slug を決める。** ファイル名だけだと別フォルダの
 * 同名ファイルが衝突する（`movie.mp4` は無数にある）。
 */
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { telopFileSchema, type TelopFile } from "../../src/schema/telop.ts";
import { sha256 } from "./hash.ts";
import { parseOrThrow, readJson, writeJson } from "./io.ts";
import { PUBLIC_SOURCE_DIR, sourceLinkPath, telopPath, telopPropsPath } from "./paths.ts";

export const resolveVideoPath = (input: string | undefined): string => {
  if (!input) {
    throw new Error(
      "動画の絶対パスを渡す: npm run caption -- --video /Users/you/Movies/clip.mp4",
    );
  }
  const path = isAbsolute(input) ? input : resolve(process.cwd(), input);
  if (!existsSync(path)) {
    throw new Error(`その動画が無い: ${path}`);
  }
  return path;
};

/** 動画1本を指す短い名前。ファイル名 + パスのハッシュ */
export const slugForVideo = (videoPath: string): string => {
  const name = basename(videoPath).replace(/\.[^.]+$/, "");
  const safe =
    name
      .toLowerCase()
      .replace(/[^a-z0-9぀-ヿ一-鿿-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "video";
  return `${safe}-${sha256(videoPath).slice(0, 8)}`;
};

/**
 * 元動画を public 以下から見えるようにする。
 *
 * **ハードリンクを張る。コピーしない。** 動画は数百MBから数GBあるので、
 * 毎回コピーするとディスクも待ち時間も無駄になる。
 *
 * シンボリックリンクは使えない。Remotion のレンダー用サーバは
 * `public/` 以下のシンボリックリンクを 404 で拒む（`serve-handler` が
 * lstat して弾く）。ハードリンクなら普通のファイルとして読める。
 *
 * ハードリンクは同じファイルシステム内でしか張れないので、外付けディスクの
 * 動画などではコピーに落ちる。
 */
export const linkSource = (videoPath: string, slug: string): string => {
  mkdirSync(PUBLIC_SOURCE_DIR, { recursive: true });
  const link = sourceLinkPath(slug);
  if (isSameFile(link, videoPath)) {
    return link;
  }
  if (existsSync(link) || isDanglingLink(link)) {
    unlinkSync(link);
  }
  try {
    linkSync(videoPath, link);
  } catch {
    // 別のファイルシステム（外付けなど）。ここだけはコピーするしかない
    copyFileSync(videoPath, link);
  }
  return link;
};

const isDanglingLink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

/** すでに同じ中身を指しているか（ハードリンクなら inode が同じ） */
const isSameFile = (a: string, b: string): boolean => {
  try {
    const sa = statSync(a);
    const sb = statSync(b);
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
};

export const readTelop = (slug: string): TelopFile =>
  parseOrThrow(telopFileSchema, readJson(telopPath(slug)), `content/telops/${slug}.json`);

export const writeTelop = (slug: string, telop: TelopFile): void => {
  const checked = parseOrThrow(telopFileSchema, telop, `テロップ（${slug}）`);
  writeJson(telopPath(slug), checked);
};

/** バンドル側が fetch で読む形にする（src/ から fs を触らないため） */
export const writeTelopProps = (slug: string, telop: TelopFile): void => {
  mkdirSync(dirname(telopPropsPath(slug)), { recursive: true });
  writeJson(telopPropsPath(slug), { telop });
};
