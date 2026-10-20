import { createI18n } from '@pawquest/i18n';
import { describe, expect, it } from 'vitest';

import { sampleReport as data } from './reportSample';
import { barsSvg, escapeHtml, lineSvg, reportHtml } from './reportHtml';

const ru = createI18n({ locale: 'ru', units: 'metric', tzOffsetMin: () => 180 });
const en = createI18n({ locale: 'en', units: 'metric', tzOffsetMin: () => 180 });

describe('reportHtml', () => {
  it('a full report: the dog, the period, numbers with n, every section, the footer; the text of the owner is escaped', () => {
    const html = reportHtml(data(), ru);
    expect(html).toContain('Фрэнни &lt;3');
    expect(html).toContain('Лабрадор');
    expect(html).toContain('Девочка');
    expect(html).toContain('3 г. 2 мес.');
    expect(html).toContain('96 км');
    expect(html).toContain('0,8');
    expect(html).toContain('всего за период: 34');
    expect(html).toContain('записей: 22');
    for (const key of [
      'Коротко',
      'Неделя за неделей',
      'Типичные ситуации',
      'Здоровье',
      'Навыки и тренировки',
      'Заметки владельца',
    ]) {
      expect(html).toContain(key);
    }
    expect(html).toContain('тянула &lt;к собаке&gt;');
    expect(html).toContain('Говорил &quot;привет&quot;');
    expect(html).toContain('Нобивак');
    expect(html).toContain('Это не диагноз');
    expect(html).not.toContain('<к собаке>');
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('sections the owner left out are not in the file; empty ones say so', () => {
    const only = reportHtml(data({ sections: ['summary'] }), ru);
    expect(only).toContain('Коротко');
    expect(only).not.toContain('Неделя за неделей');
    expect(only).not.toContain('Типичные ситуации');
    const empty = reportHtml(
      data({
        situations: [],
        examples: [],
        weights: [],
        care: [],
        symptoms: [],
        skills: [],
        notes: [],
        summary: {
          walks: 0,
          distanceM: 0,
          durationS: 0,
          activeDays: 0,
          events: 0,
          triggers: 0,
          triggersPerHour: null,
          recoveryMedianS: null,
          recoveryN: 0,
        },
      }),
      ru,
    );
    expect(empty.match(/За этот период записей нет/g)?.length).toBeGreaterThanOrEqual(4);
    expect(empty).toContain('нужен час прогулок');
    expect(empty).toContain('нет данных');
  });

  it('the language of the report is the language asked for, and the font css is put in', () => {
    const html = reportHtml(data(), en, { fontCss: "@font-face{font-family:'Onest';}" });
    expect(html).toContain('lang="en"');
    expect(html).toContain('Report for a specialist');
    expect(html).toContain('At a glance');
    expect(html).toContain('Not a diagnosis');
    expect(html).toContain("@font-face{font-family:'Onest';}");
  });

  it('the age of a dog with no date is the approximate one; none at all leaves it out', () => {
    const approx = reportHtml(
      data({ dog: { ...data().dog, birthDate: null, approxAgeMonths: 8 } }),
      ru,
    );
    expect(approx).toContain('8 мес.');
    const years = reportHtml(
      data({ dog: { ...data().dog, birthDate: null, approxAgeMonths: 24 } }),
      ru,
    );
    expect(years).toContain('2 г.');
    const none = reportHtml(
      data({ dog: { ...data().dog, birthDate: null, approxAgeMonths: null, sex: 'unknown' } }),
      ru,
    );
    expect(none).not.toContain('Девочка');
  });
});

describe('charts', () => {
  it('bars: a bar for each value, the value above it, nothing drawn for zero', () => {
    const svg = barsSvg({
      values: [0, 2, 4],
      labels: ['a', 'b', 'c'],
      color: '#123456',
      format: (v) => `${String(v)}ч`,
    });
    expect(svg.match(/<rect /g)?.length).toBe(3);
    expect(svg).toContain('4ч');
    expect(svg).not.toContain('>0ч<');
    expect(svg).toContain('#123456');
  });

  it('a line with one point or none does not break; a flat line is drawn in the middle', () => {
    const fmt = (v: number): string => String(v);
    const date = (ts: number): string => String(ts);
    expect(lineSvg([], fmt, date)).toBe('');
    expect(lineSvg([{ at: 1, value: 5 }], fmt, date)).toContain('<circle');
    const flat = lineSvg(
      [
        { at: 1, value: 5 },
        { at: 2, value: 5 },
      ],
      fmt,
      date,
    );
    expect(flat).toContain('<polyline');
  });

  it('escapes what could break out of a tag', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});
