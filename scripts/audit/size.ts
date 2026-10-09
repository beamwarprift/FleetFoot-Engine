// Size budget: minified JS per target and the store zip.

import { readNumber, readObject } from './json.ts';

export interface Budget {
  readonly jsBytesMax: number;
  readonly zipBytesMax: number;
}

export interface SizeReport {
  readonly jsBytes: number;
  readonly zipBytes: number;
}

export function parseBudget(value: unknown, source: string): Budget {
  const obj = readObject(value, source);
  return {
    jsBytesMax: readNumber(obj, 'jsBytesMax', source),
    zipBytesMax: readNumber(obj, 'zipBytesMax', source),
  };
}

export function isJavaScript(path: string): boolean {
  return /\.(?:js|mjs|cjs)$/i.test(path);
}

export function auditSize(target: string, report: SizeReport, budget: Budget): string[] {
  const errors: string[] = [];
  if (report.jsBytes > budget.jsBytesMax) {
    errors.push(`${target}: JS ${report.jsBytes} B exceeds budget ${budget.jsBytesMax} B`);
  }
  if (report.zipBytes > budget.zipBytesMax) {
    errors.push(`${target}: zip ${report.zipBytes} B exceeds budget ${budget.zipBytesMax} B`);
  }
  return errors;
}
