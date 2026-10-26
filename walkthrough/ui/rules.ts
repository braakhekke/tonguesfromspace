/** Small checks the walkthrough screens share, kept here so they can be tested without a browser. */
import type { SceneRule } from '../../shared/schema';

/** Years whose chosen scene is allowed below 100 % only because of a margin the confirmed rule does not have. */
export function needsMargin(years: Record<string, { chosen?: { gaps?: string } | null }>, rule: Pick<SceneRule, 'noDataMarginM'>): string[] {
  if ((rule.noDataMarginM ?? 0) > 0) return [];
  return Object.entries(years).filter(([, v]) => v.chosen?.gaps === 'outside-glacier').map(([y]) => y).sort();
}

const LABEL: Record<string, string> = {
  daysBeforeEnd: 'days before the year end', daysAfterEnd: 'days after the year end', maxCloud: 'max cloud', maxCloudTongue: 'max cloud over the tongue',
  maxSnow: 'max snow', fallbackCloud: 'fallback cloud', minCoverage: 'coverage', noDataMarginM: 'missing data allowed beyond the glacier (m)', oneOrbit: 'one orbit',
};
const show = (k: string, v: unknown) => (v === undefined ? 'not set' : typeof v === 'number' && /^(max|fallback)/.test(k) ? `${+(v * 100).toFixed(2)} %` : String(v));

/** What a proposed rule would change in a confirmed one, in words. The note is the person's own and is never compared. */
export function ruleDiff(confirmed: Partial<SceneRule>, proposed: Partial<SceneRule>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(LABEL)) {
    const a = (confirmed as Record<string, unknown>)[k], b = (proposed as Record<string, unknown>)[k];
    if (b !== undefined && a !== b) out.push(`${LABEL[k]}: ${show(k, a)} → ${show(k, b)}`);
  }
  return out;
}
