import { createHash } from 'node:crypto';

/** Stable JSON: keys sorted, so the same data always gives the same hash. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v as object).sort().filter((k) => (v as any)[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable((v as any)[k])).join(',') + '}';
  return JSON.stringify(v);
}
export const hash = (v: unknown) => createHash('sha256').update(stable(v)).digest('hex').slice(0, 12);
