/** `npm run x -- --topic id --section 2` 形式の素朴なパーサ */
export type Args = {
  flags: Set<string>;
  values: Map<string, string>;
  positional: string[];
};

export const parseArgs = (argv: string[] = process.argv.slice(2)): Args => {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      values.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values.set(body, next);
      i++;
    } else {
      flags.add(body);
    }
  }
  return { flags, values, positional };
};

export const getString = (args: Args, name: string): string | undefined => args.values.get(name);

export const getNumber = (args: Args, name: string): number | undefined => {
  const raw = args.values.get(name);
  if (raw === undefined) {
    return undefined;
  }
  const n = Number(raw);
  if (Number.isNaN(n)) {
    throw new Error(`--${name} に数値を渡す（受け取った値: ${raw}）`);
  }
  return n;
};

/** --topic <id>。位置引数でも受ける */
export const getTopic = (args: Args): string | undefined =>
  getString(args, "topic") ?? args.positional[0];
