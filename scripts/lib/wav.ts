/**
 * WAV の最小限の読み書き。
 * 結合はしない（Remotion がミックスする）ので、尺の実測と無音生成、
 * それに**中身が本当に PCM かどうかの確認**だけ。
 */

export type WavFormat = {
  /** 1 = PCM。それ以外は圧縮音声が WAV 容器に入っているだけ */
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  byteRate: number;
  dataBytes: number;
  durationSec: number;
};

const FORMAT_PCM = 1;

/**
 * fmt / data を読む。
 *
 * **audioFormat を必ず見る。** `extractAudio` は元の音声を再圧縮せずに
 * WAV 容器へ入れるので、中身が AAC（audioFormat=255）のまま出てくる。
 * これを PCM として読むと 67秒の音声が 14秒に見え、テロップの時刻が
 * 全部ずれる（実際に踏んだ）。
 */
export const readWavFormat = (buf: Buffer): WavFormat => {
  if (
    buf.length < 12 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("WAV として読めないデータ（エンジンの応答か抽出結果を確認する）");
  }
  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let byteRate = 0;
  let dataBytes = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      audioFormat = buf.readUInt16LE(offset + 8);
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      byteRate = buf.readUInt32LE(offset + 16);
      bitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (id === "data") {
      dataBytes = Math.min(size, buf.length - (offset + 8));
    }
    if (size === 0) {
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (byteRate === 0 || dataBytes === 0) {
    throw new Error("WAV の fmt / data チャンクが読めない");
  }
  return {
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    byteRate,
    dataBytes,
    durationSec: dataBytes / byteRate,
  };
};

export const wavDurationSec = (buf: Buffer): number => readWavFormat(buf).durationSec;

/**
 * 「16bit PCM の WAV である」ことを確かめる。合わないなら落とす。
 * 音声認識にかける前に一度通す（黙って精度が落ちるのがいちばん困る）。
 */
export const assertPcm16 = (
  fmt: WavFormat,
  expect: { sampleRate?: number; channels?: number } = {},
): WavFormat => {
  if (fmt.audioFormat !== FORMAT_PCM) {
    throw new Error(
      `PCM ではない WAV（audioFormat=${fmt.audioFormat}）。` +
        "圧縮音声が WAV 容器に入っているだけなので、ffmpeg で PCM に変換する",
    );
  }
  if (fmt.bitsPerSample !== 16) {
    throw new Error(`16bit 以外の WAV は未対応（bits=${fmt.bitsPerSample}）`);
  }
  if (expect.sampleRate !== undefined && fmt.sampleRate !== expect.sampleRate) {
    throw new Error(`サンプリングレートが ${expect.sampleRate}Hz ではない（${fmt.sampleRate}Hz）`);
  }
  if (expect.channels !== undefined && fmt.channels !== expect.channels) {
    throw new Error(`チャンネル数が ${expect.channels} ではない（${fmt.channels}）`);
  }
  return fmt;
};

/** 16bit PCM を -1..1 の列にする（インターリーブ済み） */
export const decodePcm16 = (buf: Buffer): Float32Array => {
  const fmt = readWavFormat(buf);
  assertPcm16(fmt);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      const end = offset + 8 + Math.min(size, buf.length - (offset + 8));
      const count = Math.floor((end - (offset + 8)) / 2);
      const out = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        out[i] = buf.readInt16LE(offset + 8 + i * 2) / 32768;
      }
      return out;
    }
    if (size === 0) {
      break;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV の data チャンクが読めない");
};

/** 無音 WAV（16bit mono）。mock エンジン用 */
export const silentWav = (durationSec: number, sampleRate = 24000): Buffer => {
  const samples = Math.max(1, Math.round(durationSec * sampleRate));
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(FORMAT_PCM, 20);
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate
  buf.writeUInt16LE(2, 32); // blockAlign
  buf.writeUInt16LE(16, 34); // bitsPerSample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  return buf;
};
