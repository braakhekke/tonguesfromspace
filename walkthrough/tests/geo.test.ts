import { describe, expect, it } from 'vitest';
import { areaKm2, simplifyRing, featuresBounds, imageGrid, MAX_TILE_PX, southernmost } from '../shared/geo';

describe('imageGrid', () => {
  it('Aletsch\'s box (23.5 x 24.9 km, 2345 x 2493 px) is ONE request: 2,493 px is under the API limit of 2,500', () => {
    const g = imageGrid([[46.35728576470588, 7.8781889000000005], [46.58120341176471, 8.184029341122477]]);
    expect([g.w, g.h]).toEqual([2345, 2493]);
    expect(g.tiles).toHaveLength(1);
  });
  it('one pixel over the limit is two tiles', () => {
    const g = imageGrid([[46.0, 8.0], [46.0 + (2501 * 10) / 111_200 / 0.6947, 8.1]]);
    expect(g.h).toBeGreaterThan(2500);
    expect(g.tiles.length).toBeGreaterThan(1);
  });
  it('a small box is one tile at about 10 m ground pixels', () => {
    const g = imageGrid([[46.4, 8.0], [46.5, 8.2]]);
    expect(g.tiles).toHaveLength(1);
    expect(g.tiles[0]!.w).toBe(g.w);
    // 0.2 deg of longitude at 46.45N is about 15.4 km -> about 1540 px
    expect(g.w).toBeGreaterThan(1500);
    expect(g.w).toBeLessThan(1600);
  });
  it('a box over 2,500 px is cut into equal tiles, none over the limit', () => {
    const g = imageGrid([[46.0, 7.0], [46.5, 8.0]]);
    expect(g.tiles.length).toBeGreaterThan(1);
    for (const t of g.tiles) { expect(t.w).toBeLessThanOrEqual(MAX_TILE_PX); expect(t.h).toBeLessThanOrEqual(MAX_TILE_PX); }
    expect(g.tiles.reduce((a, t) => a + t.w * t.h, 0)).toBe(g.w * g.h);
  });
  it('tiles cover the box without gaps', () => {
    const g = imageGrid([[46.0, 7.0], [46.5, 8.0]]);
    const xs = g.tiles.flatMap((t) => [t.bbox[0], t.bbox[2]]);
    expect(Math.min(...xs)).toBeCloseTo(g.bbox[0], 3);
    expect(Math.max(...xs)).toBeCloseTo(g.bbox[2], 3);
  });
  it('far north the projection pixel is wider so the ground pixel stays 10 m', () => {
    const north = imageGrid([[78.0, 15.0], [78.1, 15.4]]);
    const mid = imageGrid([[46.0, 8.0], [46.1, 8.4]]);
    expect(north.w / mid.w).toBeLessThan(0.4); // same degrees, far fewer ground metres
  });
});

describe('outlines', () => {
  const ring = [[8.0, 46.0], [8.1, 46.0], [8.1, 46.1], [8.0, 46.1], [8.0, 46.0]];
  it('area of a 0.1 x 0.1 degree box at 46 N is about 85 km²', () => {
    const a = areaKm2({ type: 'Polygon', coordinates: [ring] });
    expect(a).toBeGreaterThan(84); expect(a).toBeLessThan(87);
  });
  it('a hole is taken out', () => {
    const hole = [[8.04, 46.04], [8.06, 46.04], [8.06, 46.06], [8.04, 46.06], [8.04, 46.04]];
    expect(areaKm2({ type: 'Polygon', coordinates: [ring, hole] })).toBeLessThan(areaKm2({ type: 'Polygon', coordinates: [ring] }));
  });
  it('a MultiPolygon adds its parts', () => {
    const one = areaKm2({ type: 'Polygon', coordinates: [ring] });
    expect(areaKm2({ type: 'MultiPolygon', coordinates: [[ring], [ring]] })).toBeCloseTo(2 * one, 6);
  });
  it('bounds and the southernmost vertex', () => {
    const f = [{ geometry: { type: 'Polygon', coordinates: [ring] } }];
    expect(featuresBounds(f)).toEqual([[46.0, 8.0], [46.1, 8.1]]);
    expect(southernmost(f)![0]).toBe(46.0);
    expect(featuresBounds([])).toBeNull();
  });
});

describe('simplifying a closed ring', () => {
  const circle = Array.from({ length: 2001 }, (_, i) => [8 + 0.02 * Math.cos((i / 2000) * 2 * Math.PI), 46 + 0.02 * Math.sin((i / 2000) * 2 * Math.PI)]);
  it('really reduces it (the plain algorithm returned a closed ring unchanged)', () => {
    const s = simplifyRing(circle, 0.0001);
    expect(s.length).toBeLessThan(200);
    expect(s[0]).toEqual(s[s.length - 1]);
  });
  it('keeps a sharp spike, and the area barely changes', () => {
    const spiky = [...circle.slice(0, 1000), [8.0, 45.9], ...circle.slice(1000)];
    expect(simplifyRing(spiky, 0.0001).some(([x, y]) => x === 8.0 && y === 45.9)).toBe(true);
    const a = areaKm2({ type: 'Polygon', coordinates: [circle] }), b = areaKm2({ type: 'Polygon', coordinates: [simplifyRing(circle, 0.0001)] });
    expect(Math.abs(a - b) / a).toBeLessThan(0.01);
  });
});
