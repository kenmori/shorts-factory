/**
 * WAV の最小限の読み書き。
 * 結合はしない（Remotion がミックスする）ので、尺の実測と無音生成だけ。
 */

export const wavDurationSec = (buf: Buffer): number => {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("WAV として読めないデータが返ってきた（エンジンの応答を確認する）");
  }
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      byteRate = buf.readUInt32LE(offset + 16);
    } else if (id === "data") {
      dataSize = Math.min(size, buf.length - (offset + 8));
    }
    offset += 8 + size + (size % 2);
  }
  if (byteRate === 0 || dataSize === 0) {
    throw new Error("WAV の fmt / data チャンクが読めない");
  }
  return dataSize / byteRate;
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
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate
  buf.writeUInt16LE(2, 32); // blockAlign
  buf.writeUInt16LE(16, 34); // bitsPerSample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  return buf;
};
