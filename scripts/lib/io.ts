import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { z } from "zod";

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export const writeJson = (path: string, data: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const readYaml = (path: string): unknown => parseYaml(readFileSync(path, "utf8"));

export const writeYaml = (path: string, data: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyYaml(data), "utf8");
};

export const writeText = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
};

export const readText = (path: string): string => readFileSync(path, "utf8");

export const exists = (path: string): boolean => existsSync(path);

/** zod のエラーを人間が直せる形にして投げる */
export const parseOrThrow = <T>(schema: z.ZodType<T>, data: unknown, label: string): T => {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const lines = result.error.issues.map((i) => {
    const path = i.path.length > 0 ? i.path.join(".") : "(root)";
    return `    ${path}: ${i.message}`;
  });
  throw new Error(`${label} がスキーマに合っていない:\n${lines.join("\n")}`);
};
