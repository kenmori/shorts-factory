/**
 * mp4 の中身を読む（尺とトラックの同期情報）。
 *
 * 目的は「レンダーした実ファイル」を検証すること。タイムラインの計算値を
 * そのまま信じると、レンダーが途中で落ちた短いファイルや、映像と音声が
 * ずれたファイルを投稿してしまう。
 */
import { readFileSync } from "node:fs";

type Box = { type: string; start: number; end: number };

/** 直下のボックスを並べる */
const children = (buf: Buffer, from: number, to: number): Box[] => {
  const out: Box[] = [];
  let offset = from;
  while (offset + 8 <= to) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < header) {
      break;
    }
    out.push({ type, start: offset + header, end: offset + size });
    offset += size;
  }
  return out;
};

const pick = (list: Box[], type: string): Box | undefined => list.find((b) => b.type === type);

export type TrackKind = "video" | "audio" | "other";

export type Mp4Track = {
  kind: TrackKind;
  timescale: number;
  durationSec: number;
  /**
   * 編集リスト（elst）が先頭を飛ばす量。
   * H.264 は B フレームで並べ替えが起きるため、最初のフレームの
   * composition offset のぶんだけ飛ばすのが**正しい**（下記と一致すべき）。
   */
  editSkipSec: number;
  /** 最初のフレームの composition offset（ctts）。B フレームの並べ替えで出る */
  firstCompositionOffsetSec: number;
};

export type Mp4Info = {
  durationSec: number;
  tracks: Mp4Track[];
};

export const readMp4 = (path: string): Mp4Info => {
  const buf = readFileSync(path);
  const top = children(buf, 0, buf.length);
  const moov = pick(top, "moov");
  if (!moov) {
    throw new Error("moov が見つからない（壊れた mp4 か、レンダーが途中で落ちている）");
  }
  const moovChildren = children(buf, moov.start, moov.end);

  const mvhd = pick(moovChildren, "mvhd");
  if (!mvhd) {
    throw new Error("mvhd が見つからない");
  }
  const version = buf.readUInt8(mvhd.start);
  const durationSec =
    version === 1
      ? Number(buf.readBigUInt64BE(mvhd.start + 24)) / buf.readUInt32BE(mvhd.start + 20)
      : buf.readUInt32BE(mvhd.start + 16) / buf.readUInt32BE(mvhd.start + 12);

  const tracks: Mp4Track[] = [];
  for (const trak of moovChildren.filter((b) => b.type === "trak")) {
    const trakChildren = children(buf, trak.start, trak.end);
    const mdia = pick(trakChildren, "mdia");
    if (!mdia) {
      continue;
    }
    const mdiaChildren = children(buf, mdia.start, mdia.end);
    const mdhd = pick(mdiaChildren, "mdhd");
    const hdlr = pick(mdiaChildren, "hdlr");
    if (!mdhd) {
      continue;
    }
    const timescale = buf.readUInt32BE(mdhd.start + 12);
    const handler = hdlr ? buf.toString("ascii", hdlr.start + 8, hdlr.start + 12) : "";
    const kind: TrackKind = handler === "vide" ? "video" : handler === "soun" ? "audio" : "other";

    // 編集リスト
    let editSkipSec = 0;
    const edts = pick(trakChildren, "edts");
    if (edts) {
      const elst = pick(children(buf, edts.start, edts.end), "elst");
      if (elst && buf.readUInt32BE(elst.start + 4) > 0) {
        const mediaTime = buf.readInt32BE(elst.start + 12);
        editSkipSec = mediaTime > 0 ? mediaTime / timescale : 0;
      }
    }

    // 最初のフレームの composition offset
    let firstCompositionOffsetSec = 0;
    const minf = pick(mdiaChildren, "minf");
    const stbl = minf ? pick(children(buf, minf.start, minf.end), "stbl") : undefined;
    if (stbl) {
      const ctts = pick(children(buf, stbl.start, stbl.end), "ctts");
      if (ctts && buf.readUInt32BE(ctts.start + 4) > 0) {
        firstCompositionOffsetSec = buf.readUInt32BE(ctts.start + 12) / timescale;
      }
    }

    tracks.push({
      kind,
      timescale,
      durationSec: buf.readUInt32BE(mdhd.start + 16) / timescale,
      editSkipSec,
      firstCompositionOffsetSec,
    });
  }

  return { durationSec, tracks };
};

export const mp4DurationSec = (path: string): number => readMp4(path).durationSec;

export type AvSync = {
  /** 映像が音声より先に出る量（秒）。正なら映像が先行、負なら音声が先行 */
  videoAheadSec: number;
  /** 映像と音声の長さの差（秒） */
  durationDiffSec: number;
};

/**
 * 映像と音声のズレを求める。
 *
 * H.264 は B フレームで並べ替えが起きるので、最初のフレームの
 * composition offset だけ映像の提示開始が遅れる。**それを打ち消すのが
 * 編集リスト（elst）の役目**で、両者が一致していればズレない。
 * 一致しなくなったら（= muxer が elst を書かなくなったら）ここに出る。
 */
export const mp4AvSync = (info: Mp4Info): AvSync => {
  const video = info.tracks.find((t) => t.kind === "video");
  const audio = info.tracks.find((t) => t.kind === "audio");
  if (!video || !audio) {
    throw new Error(
      `映像と音声のトラックが揃っていない（${info.tracks.map((t) => t.kind).join(" / ") || "なし"}）`,
    );
  }
  const videoStart = video.firstCompositionOffsetSec - video.editSkipSec;
  const audioStart = audio.firstCompositionOffsetSec - audio.editSkipSec;
  return {
    videoAheadSec: audioStart - videoStart,
    durationDiffSec: video.durationSec - audio.durationSec,
  };
};
