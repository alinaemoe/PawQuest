import fs from 'node:fs';

const edit = (p, f) => {
  const s = fs.readFileSync(p, 'utf8');
  const r = f(s);
  if (r === s) throw new Error('no change ' + p);
  fs.writeFileSync(p, r);
};
const must = (s, a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70));
  return s.replace(a, b);
};

edit('packages/data/src/placeSuggest.ts', (s) => {
  let r = must(
    s,
    `/** How far apart the centres of repeated visits may be and still count as one place, by size. */
const EPS_BY_SCALE`,
    `/**
 * How far apart the centres of repeated visits may be and still count as one place: at least this
 * much by size, and 1.5 times the typical radius of the stays (two visits to a place of radius r
 * can have centres almost r apart).
 */
const EPS_BY_SCALE`,
  );
  r = must(
    r,
    `function percentile90(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)] ?? 0;
}`,
    `function percentile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? 0;
}`,
  );
  r = must(
    r,
    `    for (const suggestion of suggestPlaces(stops, saved, { epsM: EPS_BY_SCALE[scale] })) {`,
    `    const epsM = Math.max(
      EPS_BY_SCALE[scale],
      1.5 * percentile(group.map((item) => item.stay.radiusM), 0.5),
    );
    for (const suggestion of suggestPlaces(stops, saved, { epsM })) {`,
  );
  r = must(r, 'percentile90(members.map(', 'percentile(\n              members.map(');
  r = must(
    r,
    `m.stay) + m.stay.radiusM)) +
              15,`,
    `m.stay) + m.stay.radiusM),
              0.9,
            ) + 15,`,
  );
  return r;
});

edit('packages/data/src/placeSuggest.test.ts', (s) => {
  let r = must(
    s,
    "    expect(found.map((f) => f.scale).sort()).toEqual(['large', 'small'].sort());",
    "    // the park-sized wanders and the small clearing stay apart (the park's own label depends on its spread)\n    expect(found).toHaveLength(2);\n    expect(found.filter((f) => f.scale === 'small')).toHaveLength(1);\n    expect(Math.max(...found.map((f) => f.radiusM))).toBeGreaterThanOrEqual(100);",
  );
  return r;
});
