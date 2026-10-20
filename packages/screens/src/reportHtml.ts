import type {
  ReportData,
  ReportSituation,
  ReportSkill,
  ReportWeek,
  ReportWeight,
} from '@pawquest/data';
import type { I18n, MessageKey } from '@pawquest/i18n';

import { eventTypeLabel } from './model';

/**
 * The report for a specialist as one HTML page set (docs/23, step 3.21), turned into a PDF on the
 * device. Facts of the period with the number of records behind each; no grades, no diagnoses. All
 * text of the owner is escaped. Charts are inline SVG, so the file needs nothing from outside.
 */

const DAY_MS = 86_400_000;

const INK = '#16241d';
const MUTED = '#66756c';
const LINE = '#dfe6e1';
const ACCENT = '#2f7d5b';
const ACCENT_DEEP = '#1f5a41';
const ACCENT_SOFT = '#e3efe8';
const WARM = '#c2603a';
const SAND = '#f5f1ea';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

/** The facts the cover shows about the dog: breed, sex, age, size, the last weight. */
function ageText(data: ReportData, i18n: I18n): string | null {
  const { birthDate, approxAgeMonths } = data.dog;
  let months: number | null = approxAgeMonths;
  if (birthDate !== null) {
    const born = Date.parse(`${birthDate}T12:00:00Z`);
    if (Number.isFinite(born)) {
      months = Math.max(0, Math.floor((data.generatedAt - born) / (30.4375 * DAY_MS)));
    }
  }
  if (months === null) {
    return null;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return years === 0
    ? i18n.t('report.ageMonths', { m: rest })
    : rest === 0
      ? i18n.t('report.ageYears', { y: years })
      : i18n.t('report.age', { y: years, m: rest });
}

// ---------------------------------------------------------------- charts (inline SVG)

interface BarsInput {
  readonly values: readonly number[];
  readonly labels: readonly string[];
  readonly color: string;
  readonly format: (value: number) => string;
  readonly width?: number;
  readonly height?: number;
}

/** Bars over a hairline baseline; the value above each non-zero bar, the date under a few of them. */
export function barsSvg({
  values,
  labels,
  color,
  format,
  width = 520,
  height = 96,
}: BarsInput): string {
  const top = 16;
  const bottom = 16;
  const plot = height - top - bottom;
  const max = Math.max(...values, 0);
  const slot = width / Math.max(1, values.length);
  const bar = Math.min(26, slot * 0.62);
  const every = Math.ceil(values.length / 7);
  const parts = values.map((value, i) => {
    const h = max === 0 ? 0 : Math.max(value > 0 ? 3 : 0, (value / max) * plot);
    const x = slot * i + (slot - bar) / 2;
    const y = top + plot - h;
    const label =
      value > 0
        ? `<text x="${(x + bar / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="${INK}">${e(format(value))}</text>`
        : '';
    const tick =
      i % every === 0 || i === values.length - 1
        ? `<text x="${(x + bar / 2).toFixed(1)}" y="${String(height - 3)}" text-anchor="middle" font-size="8" fill="${MUTED}">${e(labels[i] ?? '')}</text>`
        : '';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}"/>${label}${tick}`;
  });
  return `<svg viewBox="0 0 ${String(width)} ${String(height)}" width="100%" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="${String(top + plot)}" x2="${String(width)}" y2="${String(top + plot)}" stroke="${LINE}" stroke-width="1"/>${parts.join('')}</svg>`;
}

export interface LinePoint {
  readonly at: number;
  readonly value: number;
}

/** A line with its points, a soft area under it, the first, last, lowest and highest values named. */
export function lineSvg(
  points: readonly LinePoint[],
  format: (value: number) => string,
  dateOf: (ts: number) => string,
  width = 520,
  height = 120,
): string {
  if (points.length === 0) {
    return '';
  }
  const padX = 34;
  const top = 20;
  const bottom = 20;
  const plotH = height - top - bottom;
  const minT = Math.min(...points.map((p) => p.at));
  const maxT = Math.max(...points.map((p) => p.at));
  const lo = Math.min(...points.map((p) => p.value));
  const hi = Math.max(...points.map((p) => p.value));
  const span = hi - lo === 0 ? 1 : hi - lo;
  const x = (t: number): number =>
    maxT === minT ? width / 2 : padX + ((t - minT) / (maxT - minT)) * (width - padX * 2);
  const y = (v: number): number =>
    hi === lo ? top + plotH / 2 : top + plotH - ((v - lo) / span) * plotH;
  const coords = points.map((p) => `${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`);
  const area = `${x(points[0]?.at ?? 0).toFixed(1)},${String(top + plotH)} ${coords.join(' ')} ${x(points[points.length - 1]?.at ?? 0).toFixed(1)},${String(top + plotH)}`;
  const named = new Set<number>([0, points.length - 1]);
  points.forEach((p, i) => {
    if (p.value === lo || p.value === hi) {
      named.add(i);
    }
  });
  const dots = points.map((p, i) => {
    const label = named.has(i)
      ? `<text x="${x(p.at).toFixed(1)}" y="${(y(p.value) - 8).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="${INK}">${e(format(p.value))}</text>`
      : '';
    return `<circle cx="${x(p.at).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.2" fill="#fff" stroke="${ACCENT}" stroke-width="2"/>${label}`;
  });
  const first = points[0];
  const last = points[points.length - 1];
  return `<svg viewBox="0 0 ${String(width)} ${String(height)}" width="100%" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="${String(top + plotH)}" x2="${String(width)}" y2="${String(top + plotH)}" stroke="${LINE}"/><polygon points="${area}" fill="${ACCENT_SOFT}" opacity="0.8"/><polyline points="${coords.join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${dots.join('')}<text x="${x(first?.at ?? 0).toFixed(1)}" y="${String(height - 4)}" text-anchor="start" font-size="8" fill="${MUTED}">${e(dateOf(first?.at ?? 0))}</text><text x="${x(last?.at ?? 0).toFixed(1)}" y="${String(height - 4)}" text-anchor="end" font-size="8" fill="${MUTED}">${e(dateOf(last?.at ?? 0))}</text></svg>`;
}

/** Three shares in one strip: far, middle, near (and nothing when no distance was noted). */
function distanceStrip(s: ReportSituation, i18n: I18n): string {
  const total = s.far + s.mid + s.near;
  if (total === 0) {
    return `<span class="muted">—</span>`;
  }
  const part = (n: number, color: string, key: MessageKey): string =>
    n === 0
      ? ''
      : `<i style="width:${((n / total) * 100).toFixed(1)}%;background:${color}" title="${e(i18n.t(key))}"></i>`;
  const words = [
    s.far > 0 ? `${i18n.t('report.dist.far')} ${String(s.far)}` : '',
    s.mid > 0 ? `${i18n.t('report.dist.mid')} ${String(s.mid)}` : '',
    s.near > 0 ? `${i18n.t('report.dist.near')} ${String(s.near)}` : '',
  ].filter((w) => w !== '');
  return `<div class="strip">${part(s.far, '#9ccab5', 'report.dist.far')}${part(s.mid, ACCENT, 'report.dist.mid')}${part(s.near, WARM, 'report.dist.near')}</div><div class="small muted">${e(words.join(' · '))}</div>`;
}

// ---------------------------------------------------------------- the page

const PAW_SVG = `<svg viewBox="0 0 48 48" width="30" height="30" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="20" r="3.4"/><circle cx="20.5" cy="11.5" r="3.4"/><circle cx="31" cy="11.5" r="3.4"/><circle cx="38" cy="20" r="3.4"/><path d="M24 24c-6 0-12 7-12 12 0 4 4 5 8 4 2-.6 3-.8 4-.8s2 .2 4 .8c4 1 8 0 8-4 0-5-6-12-12-12z"/></g></svg>`;

export interface ReportHtmlOptions {
  /** `@font-face` rules with the fonts of the app embedded; the system fonts serve when empty. */
  readonly fontCss?: string;
}

const STYLE = (fontCss: string): string => `
${fontCss}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Onest', 'Roboto', 'Helvetica Neue', Arial, sans-serif; color: ${INK}; font-size: 10.5px; line-height: 1.45; background: #fff; }
.page { padding: 0 34px 46px; }
.hero { background: linear-gradient(135deg, ${ACCENT_DEEP} 0%, ${ACCENT} 70%, #4aa57b 100%); color: #fff; padding: 26px 34px 24px; margin: 0 -34px 18px; }
.hero .top { display: flex; align-items: center; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 9px; font-family: 'Unbounded', 'Onest', sans-serif; font-weight: 600; font-size: 11px; letter-spacing: .02em; }
.brand .logo { width: 34px; height: 34px; border-radius: 11px; background: rgba(255,255,255,.18); display: flex; align-items: center; justify-content: center; }
.eyebrow { font-size: 9.5px; text-transform: uppercase; letter-spacing: .14em; opacity: .85; }
.hero h1 { font-family: 'Unbounded', 'Onest', sans-serif; font-weight: 600; font-size: 30px; line-height: 1.1; margin: 18px 0 6px; letter-spacing: -.01em; }
.hero .meta { font-size: 12px; opacity: .92; }
.pills { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.pill { background: rgba(255,255,255,.16); border-radius: 999px; padding: 4px 11px; font-size: 10.5px; }
h2 { font-family: 'Unbounded', 'Onest', sans-serif; font-weight: 500; font-size: 13px; margin: 0 0 9px; display: flex; align-items: center; gap: 8px; }
h2:before { content: ''; width: 4px; height: 15px; border-radius: 2px; background: ${ACCENT}; display: inline-block; }
section { margin: 0 0 20px; break-inside: avoid; page-break-inside: avoid; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.tile { background: ${SAND}; border-radius: 12px; padding: 11px 12px 10px; }
.tile .v { font-family: 'Unbounded', 'Onest', sans-serif; font-weight: 600; font-size: 19px; line-height: 1.15; }
.tile .v small { font-size: 11px; font-weight: 500; }
.tile .l { font-size: 10px; color: ${MUTED}; margin-top: 3px; }
.tile .n { font-size: 9px; color: ${MUTED}; margin-top: 1px; opacity: .85; }
.card { border: 1px solid ${LINE}; border-radius: 12px; padding: 11px 13px; }
.cardtitle { font-size: 10px; color: ${MUTED}; margin-bottom: 4px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: ${MUTED}; padding: 0 8px 6px 0; border-bottom: 1px solid ${LINE}; }
td { padding: 7px 8px 7px 0; border-bottom: 1px solid ${LINE}; vertical-align: top; }
tr:last-child td { border-bottom: none; }
.muted { color: ${MUTED}; }
.small { font-size: 9px; }
.strip { display: flex; height: 7px; border-radius: 4px; overflow: hidden; background: ${LINE}; margin-bottom: 3px; }
.strip i { display: block; height: 100%; }
.note { font-size: 9px; color: ${MUTED}; margin-top: 7px; }
.empty { color: ${MUTED}; font-size: 10.5px; padding: 4px 0; }
.skill { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid ${LINE}; }
.skill:last-child { border-bottom: none; }
.skill .name { font-weight: 600; flex: 1.1; }
.steps { display: flex; gap: 3px; margin-top: 4px; }
.steps i { width: 14px; height: 6px; border-radius: 3px; background: ${LINE}; display: block; }
.steps i.on { background: ${ACCENT}; }
.quote { border-left: 3px solid ${ACCENT_SOFT}; padding: 2px 0 2px 10px; margin: 0 0 8px; }
.quote .when { font-size: 9px; color: ${MUTED}; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 9px 34px 12px; font-size: 8.5px; color: ${MUTED}; background: #fff; border-top: 1px solid ${LINE}; display: flex; justify-content: space-between; gap: 18px; }
`;

function kpiTile(value: string, label: string, note: string | null): string {
  return `<div class="tile"><div class="v">${value}</div><div class="l">${e(label)}</div>${note === null ? '' : `<div class="n">${e(note)}</div>`}</div>`;
}

function summarySection(data: ReportData, i18n: I18n): string {
  const s = data.summary;
  const hours = s.durationS / 3600;
  const time =
    s.durationS === 0
      ? `0<small> ${e(i18n.t('report.unit.h'))}</small>`
      : `${e(i18n.formatNumber(hours, hours < 10 ? 1 : 0))}<small> ${e(i18n.t('report.unit.h'))}</small>`;
  const rate =
    s.triggersPerHour === null
      ? `<small>${e(i18n.t('report.noRate'))}</small>`
      : e(i18n.formatNumber(s.triggersPerHour, 1));
  const recovery =
    s.recoveryMedianS === null
      ? `<small>${e(i18n.t('report.noData'))}</small>`
      : e(i18n.formatDuration(Math.round(s.recoveryMedianS)));
  return `<section><h2>${e(i18n.t('report.section.summary'))}</h2><div class="grid3">
${kpiTile(String(s.walks), i18n.t('report.kpi.walks'), null)}
${kpiTile(e(i18n.formatDistance(s.distanceM)), i18n.t('report.kpi.distance'), null)}
${kpiTile(time, i18n.t('report.kpi.time'), null)}
${kpiTile(String(s.activeDays), i18n.t('report.kpi.days'), null)}
${kpiTile(rate, i18n.t('report.kpi.rate'), i18n.t('report.nTriggers', { n: s.triggers }))}
${kpiTile(recovery, i18n.t('report.kpi.recovery'), i18n.t('report.nRecords', { n: s.recoveryN }))}
</div></section>`;
}

function activitySection(data: ReportData, i18n: I18n): string {
  const weeks: readonly ReportWeek[] = data.weeks;
  if (weeks.length === 0) {
    return '';
  }
  const label = (w: ReportWeek): string => i18n.formatDate(w.fromTs, w.fromTs + 800 * DAY_MS);
  const short = weeks.map((w) =>
    label(w)
      .replace(/ \d{4}$/, '')
      .replace(/,? \d{4}$/, ''),
  );
  const hours = barsSvg({
    values: weeks.map((w) => Math.round((w.durationS / 3600) * 10) / 10),
    labels: short,
    color: ACCENT,
    format: (v) => i18n.formatNumber(v, 1),
  });
  const triggers = barsSvg({
    values: weeks.map((w) => w.triggers),
    labels: short,
    color: WARM,
    format: (v) => String(v),
  });
  return `<section><h2>${e(i18n.t('report.section.activity'))}</h2>
<div class="card"><div class="cardtitle">${e(i18n.t('report.activity.time'))}</div>${hours}</div>
<div class="card" style="margin-top:9px"><div class="cardtitle">${e(i18n.t('report.activity.triggers'))}</div>${triggers}</div>
<div class="note">${e(i18n.t('report.activity.note'))}</div></section>`;
}

function situationsSection(data: ReportData, i18n: I18n): string {
  const types = new Map(data.types.map((t) => [t.id, t]));
  const name = (id: string): string => eventTypeLabel(types.get(id), id, i18n);
  const rows = data.situations
    .map((s) => {
      const reaction =
        s.reactionMean === null
          ? '<span class="muted">—</span>'
          : `${e(i18n.formatNumber(s.reactionMean, 1))} <span class="muted small">${e(i18n.t('report.nOf', { n: s.reactionN }))}</span>`;
      const recovery =
        s.recoveryMedianS === null
          ? '<span class="muted">—</span>'
          : `${e(i18n.formatDuration(Math.round(s.recoveryMedianS)))} <span class="muted small">${e(i18n.t('report.nOf', { n: s.recoveryN }))}</span>`;
      return `<tr><td><b>${e(name(s.typeId))}</b></td><td>${String(s.count)}</td><td>${reaction}</td><td style="width:34%">${distanceStrip(s, i18n)}</td><td>${recovery}</td></tr>`;
    })
    .join('');
  const examples = data.examples
    .map(
      (x) =>
        `<tr><td style="width:19%" class="muted">${e(i18n.formatDate(x.ts, x.ts + 800 * DAY_MS))}</td><td><b>${e(name(x.typeId))}</b>${x.placeName === null ? '' : ` <span class="muted">· ${e(x.placeName)}</span>`}${x.note === null ? '' : `<div class="muted">${e(x.note)}</div>`}</td></tr>`,
    )
    .join('');
  return `<section><h2>${e(i18n.t('report.section.situations'))}</h2>${
    rows === ''
      ? `<div class="empty">${e(i18n.t('report.empty'))}</div>`
      : `<table><tr><th>${e(i18n.t('report.col.situation'))}</th><th>${e(i18n.t('report.col.count'))}</th><th>${e(i18n.t('report.col.reaction'))}</th><th>${e(i18n.t('report.col.distance'))}</th><th>${e(i18n.t('report.col.recovery'))}</th></tr>${rows}</table><div class="note">${e(i18n.t('report.situations.note'))}</div>`
  }${
    examples === ''
      ? ''
      : `<div class="card" style="margin-top:10px"><div class="cardtitle">${e(i18n.t('report.examples'))}</div><table>${examples}</table></div>`
  }</section>`;
}

function weightBlock(weights: readonly ReportWeight[], i18n: I18n): string {
  if (weights.length === 0) {
    return `<div class="empty">${e(i18n.t('report.empty'))}</div>`;
  }
  const first = weights[0];
  const last = weights[weights.length - 1];
  const diff = (last?.grams ?? 0) - (first?.grams ?? 0);
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const change =
    weights.length < 2
      ? ''
      : `<div class="muted" style="margin-top:2px">${e(i18n.t('report.weight.change', { diff: `${sign}${i18n.formatWeight(Math.abs(diff))}` }))}</div>`;
  return `${lineSvg(
    weights.map((w) => ({ at: w.at, value: w.grams })),
    (v) => i18n.formatWeight(v),
    (ts) => i18n.formatDate(ts, ts + 800 * DAY_MS),
  )}${change}`;
}

function healthSection(data: ReportData, i18n: I18n): string {
  const care = data.care
    .map((c) => {
      const kind = i18n.t(`report.care.${c.kind}` as MessageKey);
      return `<tr><td style="width:19%" class="muted">${e(i18n.formatDate(c.doneAt, c.doneAt + 800 * DAY_MS))}</td><td><b>${e(c.title)}</b> <span class="muted">· ${e(kind)}</span></td><td>${c.product === null ? '<span class="muted">—</span>' : e(c.product)}</td><td>${c.nextDue === null ? '<span class="muted">—</span>' : e(i18n.formatDate(c.nextDue, c.nextDue + 800 * DAY_MS))}</td></tr>`;
    })
    .join('');
  const symptoms = data.symptoms
    .map((s) => {
      const freq = s.frequency === null ? '—' : i18n.t(`report.freq.${s.frequency}` as MessageKey);
      const length =
        s.endedAt === null
          ? i18n.t('report.ongoing')
          : i18n.formatDuration(Math.max(60, Math.round((s.endedAt - s.startedAt) / 1000)));
      return `<tr><td style="width:19%" class="muted">${e(i18n.formatDate(s.startedAt, s.startedAt + 800 * DAY_MS))}</td><td><b>${e(s.otherLabel ?? s.symptom)}</b>${s.notes === null ? '' : `<div class="muted">${e(s.notes)}</div>`}</td><td>${e(freq)}</td><td>${s.severity === null ? '—' : e(i18n.t('report.severity', { n: s.severity }))}</td><td>${e(length)}</td></tr>`;
    })
    .join('');
  return `<section><h2>${e(i18n.t('report.section.health'))}</h2>
<div class="card"><div class="cardtitle">${e(i18n.t('report.health.weight'))}</div>${weightBlock(data.weights, i18n)}</div>
<div class="card" style="margin-top:9px"><div class="cardtitle">${e(i18n.t('report.health.care'))}</div>${
    care === ''
      ? `<div class="empty">${e(i18n.t('report.empty'))}</div>`
      : `<table><tr><th>${e(i18n.t('report.col.date'))}</th><th>${e(i18n.t('report.col.what'))}</th><th>${e(i18n.t('report.col.product'))}</th><th>${e(i18n.t('report.col.next'))}</th></tr>${care}</table>`
  }</div>${
    symptoms === ''
      ? ''
      : `<div class="card" style="margin-top:9px"><div class="cardtitle">${e(i18n.t('report.health.symptoms'))}</div><table><tr><th>${e(i18n.t('report.col.date'))}</th><th>${e(i18n.t('report.col.symptom'))}</th><th>${e(i18n.t('report.col.frequency'))}</th><th>${e(i18n.t('report.col.severity'))}</th><th>${e(i18n.t('report.col.length'))}</th></tr>${symptoms}</table></div>`
  }</section>`;
}

function skillRow(skill: ReportSkill, i18n: I18n): string {
  const steps = Array.from(
    { length: Math.min(12, skill.levelsTotal) },
    (_, i) => `<i class="${i < (skill.levelPosition ?? 0) ? 'on' : ''}"></i>`,
  ).join('');
  const total = skill.successful + skill.partial + skill.unsuccessful;
  const share = (n: number, color: string): string =>
    n === 0 ? '' : `<i style="width:${((n / total) * 100).toFixed(1)}%;background:${color}"></i>`;
  return `<div class="skill"><div class="name">${e(skill.name)}${
    skill.levelTitle === null
      ? ''
      : `<div class="muted" style="font-weight:400">${e(i18n.t('report.skills.step', { n: skill.levelPosition ?? 0, total: skill.levelsTotal }))} · ${e(skill.levelTitle)}</div><div class="steps">${steps}</div>`
  }</div><div style="flex:1">${
    total === 0
      ? `<span class="muted">${e(i18n.t('report.skills.sessionsOnly', { n: skill.sessions }))}</span>`
      : `<div class="strip">${share(skill.successful, ACCENT)}${share(skill.partial, '#9ccab5')}${share(skill.unsuccessful, '#d9b8a8')}</div><div class="small muted">${e(i18n.t('report.skills.attempts', { s: skill.successful, p: skill.partial, u: skill.unsuccessful, n: skill.sessions }))}</div>`
  }</div></div>`;
}

function skillsSection(data: ReportData, i18n: I18n): string {
  return `<section><h2>${e(i18n.t('report.section.skills'))}</h2>${
    data.skills.length === 0
      ? `<div class="empty">${e(i18n.t('report.empty'))}</div>`
      : `<div class="card">${data.skills.map((s) => skillRow(s, i18n)).join('')}</div>`
  }</section>`;
}

function notesSection(data: ReportData, i18n: I18n): string {
  const types = new Map(data.types.map((t) => [t.id, t]));
  const items = data.notes
    .map((n) => {
      const what =
        n.source === 'walk'
          ? i18n.t('report.notes.walk')
          : eventTypeLabel(types.get(n.typeId ?? ''), n.typeId ?? '', i18n);
      return `<div class="quote"><div class="when">${e(i18n.formatDate(n.ts, n.ts + 800 * DAY_MS))} · ${e(what)}</div>${e(n.text)}</div>`;
    })
    .join('');
  return `<section><h2>${e(i18n.t('report.section.notes'))}</h2>${
    items === '' ? `<div class="empty">${e(i18n.t('report.empty'))}</div>` : items
  }</section>`;
}

/** The whole report, ready for `expo-print`. */
export function reportHtml(data: ReportData, i18n: I18n, options: ReportHtmlOptions = {}): string {
  const has = (s: ReportData['sections'][number]): boolean => data.sections.includes(s);
  const facts = [
    data.dog.breed,
    data.dog.sex === null || data.dog.sex === 'unknown'
      ? null
      : i18n.t(`sex.${data.dog.sex}` as MessageKey),
    ageText(data, i18n),
    data.dog.size === null ? null : i18n.t(`size.${data.dog.size}` as MessageKey),
  ].filter((x): x is string => x !== null && x !== '');
  const days = Math.max(1, Math.round((data.toTs - data.fromTs) / DAY_MS));
  const period = `${i18n.formatDate(data.fromTs, data.fromTs + 800 * DAY_MS)} – ${i18n.formatDate(data.toTs - 1, data.toTs + 800 * DAY_MS)}`;
  const generated = i18n.formatDate(data.generatedAt, data.generatedAt + 800 * DAY_MS);
  const basis = i18n.t('report.basis', { walks: data.summary.walks, events: data.summary.events });
  const body = [
    has('summary') ? summarySection(data, i18n) : '',
    has('activity') ? activitySection(data, i18n) : '',
    has('situations') ? situationsSection(data, i18n) : '',
    has('health') ? healthSection(data, i18n) : '',
    has('skills') ? skillsSection(data, i18n) : '',
    has('notes') ? notesSection(data, i18n) : '',
  ].join('\n');
  return `<!doctype html><html lang="${i18n.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(i18n.t('report.eyebrow'))} — ${e(data.dog.name)}</title><style>${STYLE(options.fontCss ?? '')}</style></head><body>
<div class="page">
<div class="hero"><div class="top"><div class="brand"><span class="logo">${PAW_SVG}</span>PawQuest</div><div class="eyebrow">${e(i18n.t('report.eyebrow'))}</div></div>
<h1>${e(data.dog.name)}</h1>
<div class="meta">${e(facts.join(' · '))}</div>
<div class="pills"><span class="pill">${e(period)}</span><span class="pill">${e(i18n.t('report.days', { n: days }))}</span><span class="pill">${e(basis)}</span></div></div>
${body}
</div>
<div class="footer"><span>${e(i18n.t('report.footer'))}</span><span>${e(generated)}</span></div>
</body></html>`;
}
