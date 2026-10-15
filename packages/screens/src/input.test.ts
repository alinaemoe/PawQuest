import { describe, expect, it } from 'vitest';

import { distanceToMeters, parseDecimal, parseMinutes, weightToGrams } from './input';

describe('parseDecimal', () => {
  it('reads dots, commas and stray spaces', () => {
    expect(parseDecimal('6.2')).toBe(6.2);
    expect(parseDecimal('6,2')).toBe(6.2);
    expect(parseDecimal(' 12 ')).toBe(12);
    expect(parseDecimal('1 5,5')).toBe(15.5);
  });

  it('rejects anything that is not a plain positive number', () => {
    for (const text of ['', ' ', 'abc', '-3', '1,2,3', '1.', '.5', '1e3', '6.2kg']) {
      expect(parseDecimal(text), text).toBeNull();
    }
  });
});

describe('weightToGrams', () => {
  it('converts kilograms and pounds to grams', () => {
    expect(weightToGrams('6,2', 'metric')).toBe(6200);
    expect(weightToGrams('13.7', 'imperial')).toBe(6214);
  });

  it('rejects typos outside what a dog can weigh', () => {
    expect(weightToGrams('0.01', 'metric')).toBeNull();
    expect(weightToGrams('200', 'metric')).toBeNull();
    expect(weightToGrams('0', 'metric')).toBeNull();
    expect(weightToGrams('x', 'metric')).toBeNull();
    expect(weightToGrams('120', 'metric')).toBe(120_000);
  });
});

describe('distanceToMeters', () => {
  it('converts km and miles, empty means not given', () => {
    expect(distanceToMeters('1,84', 'metric')).toBe(1840);
    expect(distanceToMeters('2', 'imperial')).toBe(3219);
    expect(distanceToMeters('', 'metric')).toBeNull();
  });

  it('rejects zero and absurd distances', () => {
    expect(distanceToMeters('0', 'metric')).toBeNull();
    expect(distanceToMeters('500', 'metric')).toBeNull();
  });
});

describe('parseMinutes', () => {
  it('accepts whole minutes from 1 to 1440', () => {
    expect(parseMinutes('32')).toBe(32);
    expect(parseMinutes(' 45 ')).toBe(45);
    expect(parseMinutes('1440')).toBe(1440);
  });

  it('rejects empty, zero, fractions, negatives and too long', () => {
    for (const text of ['', '0', '1.5', '-5', '1441', '12345', 'ab']) {
      expect(parseMinutes(text), text).toBeNull();
    }
  });
});
