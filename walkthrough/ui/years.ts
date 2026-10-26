/** "1980-2026", "2016, 2018, 2020-2022": ranges and lists. Anything else is ignored. */
export function parseYears(text: string, max: number): number[] {
  const out = new Set<number>();
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d{4})(?:\s*[-–]\s*(\d{4}))?$/.exec(tok);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    for (let y = Math.min(a, b); y <= Math.max(a, b) && y <= max; y++) if (y >= 1900) out.add(y);
  }
  return [...out].sort((x, y) => x - y);
}

