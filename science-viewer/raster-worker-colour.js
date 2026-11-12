export function colour(t) {
  const stops = [[28,27,66],[55,81,139],[31,156,161],[149,211,112],[252,214,92],[206,64,57]];
  const p = Math.max(0, Math.min(1, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  return stops[i].map((v,k) => Math.round(v + f * (stops[i+1][k] - v)));
}
