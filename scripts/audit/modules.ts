// Module size: no product module (TypeScript in src/ and entrypoints/) longer than one cap. A module
// over it is debt the user approved, listed with its length in a baseline that may only shrink:
// growing past it fails, and so does a baseline left higher than the module now is.

import { isObject, readNumber, readObject } from './json.ts';

export interface ModulePolicy {
  readonly maxLines: number;
  /** Approved debt: module path → its length when approved. */
  readonly baseline: Readonly<Record<string, number>>;
}

const isLength = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export function parseModulePolicy(value: unknown, source: string): ModulePolicy {
  const obj = readObject(value, source);
  const maxLines = readNumber(obj, 'maxLines', source);
  if (!isLength(maxLines)) throw new Error(`${source}: "maxLines" must be a positive integer`);
  const baseline = obj['baseline'];
  if (!isObject(baseline) || !Object.values(baseline).every(isLength)) {
    throw new Error(`${source}: "baseline" must map module paths to positive integers`);
  }
  return { maxLines, baseline: baseline as Readonly<Record<string, number>> };
}

/** Lines as an editor numbers them: a final newline ends the last line, it does not open one. */
export function lineCount(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

/** Whether a path is a product module the cap applies to. */
export function isProductModule(path: string): boolean {
  return /^(?:src|entrypoints)\/.+\.ts$/.test(path) && !path.endsWith('.d.ts');
}

export function auditModules(
  lengths: Readonly<Record<string, number>>,
  policy: ModulePolicy,
): string[] {
  const errors: string[] = [];
  const { maxLines, baseline } = policy;
  for (const [path, lines] of Object.entries(lengths)) {
    const approved = baseline[path];
    if (approved === undefined) {
      if (lines > maxLines) errors.push(`${path}: ${lines} lines, over the cap of ${maxLines}`);
    } else if (lines > approved) {
      errors.push(`${path}: ${lines} lines, over its approved ${approved}`);
    } else if (lines <= maxLines) {
      errors.push(`${path}: ${lines} lines, back under the cap: remove it from the baseline`);
    } else if (lines < approved) {
      errors.push(`${path}: ${lines} lines, lower its baseline from ${approved}`);
    }
  }
  for (const path of Object.keys(baseline)) {
    if (lengths[path] === undefined) errors.push(`${path}: in the baseline, not in the tree`);
  }
  return errors;
}
