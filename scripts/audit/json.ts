// Typed readers for untrusted JSON. JSON.parse returns `any`; every value is narrowed from `unknown` here.

export type JsonObject = { readonly [key: string]: unknown };

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJson(text: string, source: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    throw new Error(`${source}: invalid JSON (${String(error)})`);
  }
}

export function readObject(value: unknown, source: string): JsonObject {
  if (!isObject(value)) throw new Error(`${source}: expected an object`);
  return value;
}

export function readString(obj: JsonObject, key: string, source: string): string {
  const value = obj[key];
  if (typeof value !== 'string') throw new Error(`${source}: "${key}" must be a string`);
  return value;
}

export function readNumber(obj: JsonObject, key: string, source: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${source}: "${key}" must be a finite number`);
  }
  return value;
}

export function readStringArray(obj: JsonObject, key: string, source: string): string[] {
  const value = obj[key];
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new Error(`${source}: "${key}" must be an array of strings`);
  }
  return value;
}
