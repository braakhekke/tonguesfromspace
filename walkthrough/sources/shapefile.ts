/** A small reader for ESRI shapefiles (polygons) and their DBF tables. Enough for glacier inventories; no dependencies. */
import { readFileSync } from 'node:fs';

export type Ring = [number, number][];
export type Polygon = Ring[]; // first ring outer, the rest holes, in the file's own coordinates
export type Row = Record<string, string>;

const signedArea = (r: Ring) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1]; return a / 2; };

/** Polygons of a .shp, one entry per record (null for a null shape). Shapefile rings: outer = clockwise, holes = counter-clockwise. */
export function readShp(path: string): (Polygon[] | null)[] {
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getInt32(0, false) !== 9994) throw new Error(`${path}: not a shapefile`);
  const type = v.getInt32(32, true);
  if (type !== 5 && type !== 15 && type !== 25) throw new Error(`${path}: shape type ${type} is not a polygon type`);
  const out: (Polygon[] | null)[] = [];
  let o = 100;
  while (o + 8 <= b.length) {
    const len = v.getInt32(o + 4, false) * 2;
    const rec = o + 8;
    o = rec + len;
    const st = v.getInt32(rec, true);
    if (st === 0) { out.push(null); continue; }
    const nParts = v.getInt32(rec + 36, true), nPts = v.getInt32(rec + 40, true);
    const parts: number[] = [];
    for (let i = 0; i < nParts; i++) parts.push(v.getInt32(rec + 44 + 4 * i, true));
    const p0 = rec + 44 + 4 * nParts;
    const rings: Ring[] = [];
    for (let i = 0; i < nParts; i++) {
      const from = parts[i]!, to = i + 1 < nParts ? parts[i + 1]! : nPts, r: Ring = [];
      for (let k = from; k < to; k++) r.push([v.getFloat64(p0 + 16 * k, true), v.getFloat64(p0 + 16 * k + 8, true)]);
      rings.push(r);
    }
    const polys: Polygon[] = [];
    for (const r of rings) { if (signedArea(r) <= 0) polys.push([r]); else if (polys.length) polys[polys.length - 1]!.push(r); else polys.push([r]); }
    out.push(polys);
  }
  return out;
}

/** The rows of a .dbf as strings. UTF-8, falling back to Latin-1 for a value that is not valid UTF-8. */
export function readDbf(path: string): Row[] {
  const b = readFileSync(path);
  const n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10);
  const fields: [string, number][] = [];
  for (let i = 32; b[i] !== 0x0d; i += 32) fields.push([b.subarray(i, i + 11).toString('latin1').split('\0')[0]!, b[i + 16]!]);
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const rows: Row[] = [];
  for (let r = 0; r < n; r++) {
    const o = hl + r * rl;
    if (b[o] === 0x2a) { rows.push({}); continue; } // deleted: keep the row so indices still match the shapes
    let p = o + 1;
    const row: Row = {};
    for (const [name, len] of fields) {
      const raw = b.subarray(p, p + len);
      let s: string;
      try { s = utf8.decode(raw); } catch { s = raw.toString('latin1'); }
      row[name] = s.trim(); p += len;
    }
    rows.push(row);
  }
  return rows;
}
