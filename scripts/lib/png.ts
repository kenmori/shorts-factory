/**
 * PNG の最小限のデコーダ。
 *
 * レンダーしたフレームを**機械で見る**ために使う（文字が消えていないか）。
 * 画像ライブラリを足すと Remotion のバンドルと npm install に効くので、
 * node:zlib だけで済ませる。対応は 8bit / RGB・RGBA / 非インタレース
 * （Remotion の renderStill が出すもの）。
 */
import { inflateSync } from "node:zlib";

export type Image = {
  width: number;
  height: number;
  /** RGBA 8bit。長さ = width * height * 4 */
  pixels: Uint8Array;
};

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Paeth 予測子（PNG のフィルタ 4） */
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
};

export const decodePng = (buf: Buffer): Image => {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("PNG ではない");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body.readUInt8(8);
      colorType = body.readUInt8(9);
      if (body.readUInt8(12) !== 0) {
        throw new Error("インタレース PNG は未対応");
      }
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length; // length + type + data + CRC
  }

  if (bitDepth !== 8) {
    throw new Error(`bitDepth=${bitDepth} は未対応（8 のみ）`);
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) {
    throw new Error(`colorType=${colorType} は未対応（2 か 6 のみ）`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8Array(stride);

    for (let x = 0; x < stride; x++) {
      const value = line[x] ?? 0;
      const a = x >= channels ? (cur[x - channels] ?? 0) : 0;
      const b = prev[x] ?? 0;
      const c = x >= channels ? (prev[x - channels] ?? 0) : 0;
      let out: number;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + a;
          break;
        case 2:
          out = value + b;
          break;
        case 3:
          out = value + ((a + b) >> 1);
          break;
        case 4:
          out = value + paeth(a, b, c);
          break;
        default:
          throw new Error(`知らないフィルタ: ${String(filter)}`);
      }
      cur[x] = out & 0xff;
    }

    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      pixels[dst] = cur[src] ?? 0;
      pixels[dst + 1] = cur[src + 1] ?? 0;
      pixels[dst + 2] = cur[src + 2] ?? 0;
      pixels[dst + 3] = channels === 4 ? (cur[src + 3] ?? 255) : 255;
    }
    prev = cur;
  }

  return { width, height, pixels };
};

/** Rec.601 の輝度 */
export const luminance = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b;

/**
 * 明るいピクセルの割合。**「文字が出ているか」の指標。**
 *
 * このテンプレは暗い背景（輝度20前後）に明るい文字（250前後）なので、
 * この比率が落ちたらその瞬間だけ文字が消えたということ。
 */
export const brightPixelRatio = (image: Image, threshold = 140): number => {
  let bright = 0;
  const total = image.width * image.height;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (luminance(image.pixels[o] ?? 0, image.pixels[o + 1] ?? 0, image.pixels[o + 2] ?? 0) >= threshold) {
      bright++;
    }
  }
  return bright / total;
};
