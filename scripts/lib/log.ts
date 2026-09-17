const ESC = String.fromCharCode(27);
const enabled = process.env.NO_COLOR ? false : process.stdout.isTTY === true;
const paint = (code: string, s: string): string =>
  enabled ? `${ESC}[${code}m${s}${ESC}[0m` : s;

export const log = {
  step: (msg: string): void => console.log(paint("36;1", `> ${msg}`)),
  info: (msg: string): void => console.log(`  ${msg}`),
  ok: (msg: string): void => console.log(paint("32", `  OK   ${msg}`)),
  skip: (msg: string): void => console.log(paint("90", `  skip ${msg}`)),
  warn: (msg: string): void => console.warn(paint("33", `  WARN ${msg}`)),
  fail: (msg: string): void => console.error(paint("31;1", `  FAIL ${msg}`)),
  blank: (): void => console.log(""),
};

/** 例外ではなく「ここで止めて次の操作を指示する」ための終了 */
export class Halt extends Error {
  constructor(
    message: string,
    readonly nextSteps: string[] = [],
  ) {
    super(message);
    this.name = "Halt";
  }
}

export const runMain = async (fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Halt) {
      log.blank();
      log.warn(err.message);
      for (const s of err.nextSteps) {
        console.log(`    ${s}`);
      }
      log.blank();
      process.exit(2);
    }
    log.blank();
    log.fail(err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack && process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
};
