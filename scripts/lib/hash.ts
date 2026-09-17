import { createHash } from "node:crypto";

export const sha256 = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

export const sha256Buffer = (buf: Buffer): string =>
  createHash("sha256").update(buf).digest("hex");
