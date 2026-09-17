/**
 * mp4 の尺を読む（moov/mvhd）。
 *
 * 目的は「レンダーした実ファイル」を検証すること。タイムラインの計算値を
 * そのまま信じると、レンダーが途中で落ちた短いファイルを投稿してしまう。
 */
import { openSync, readSync, closeSync, statSync } from "node:fs";

const readBytes = (fd: number, position: number, length: number): Buffer => {
  const buf = Buffer.alloc(length);
  const read = readSync(fd, buf, 0, length, position);
  return buf.subarray(0, read);
};

/** 指定のボックスを深さ優先で探す */
const findBox = (
  fd: number,
  start: number,
  end: number,
  target: string,
  descendInto: string[],
): { start: number; end: number } | null => {
  let offset = start;
  while (offset + 8 <= end) {
    const header = readBytes(fd, offset, 8);
    if (header.length < 8) {
      return null;
    }
    let size = header.readUInt32BE(0);
    const type = header.toString("ascii", 4, 8);
    let headerSize = 8;
    if (size === 1) {
      const ext = readBytes(fd, offset + 8, 8);
      size = Number(ext.readBigUInt64BE(0));
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize) {
      return null;
    }
    if (type === target) {
      return { start: offset + headerSize, end: offset + size };
    }
    if (descendInto.includes(type)) {
      const found = findBox(fd, offset + headerSize, offset + size, target, descendInto);
      if (found) {
        return found;
      }
    }
    offset += size;
  }
  return null;
};

export const mp4DurationSec = (path: string): number => {
  const size = statSync(path).size;
  const fd = openSync(path, "r");
  try {
    const mvhd = findBox(fd, 0, size, "mvhd", ["moov"]);
    if (!mvhd) {
      throw new Error("moov/mvhd が見つからない（壊れた mp4 か、レンダーが途中で落ちている）");
    }
    const body = readBytes(fd, mvhd.start, 32);
    const version = body.readUInt8(0);
    if (version === 1) {
      const timescale = body.readUInt32BE(20);
      const duration = Number(body.readBigUInt64BE(24));
      return duration / timescale;
    }
    const timescale = body.readUInt32BE(12);
    const duration = body.readUInt32BE(16);
    return duration / timescale;
  } finally {
    closeSync(fd);
  }
};
