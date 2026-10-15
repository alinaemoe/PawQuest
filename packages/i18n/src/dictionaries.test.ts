import { describe, expect, it } from 'vitest';

import { en } from './dictionaries/en';
import { ru } from './dictionaries/ru';
import type { Message } from './types';

type Entry = readonly [string, Message];

function entries(dictionary: Readonly<Record<string, Message>>): Entry[] {
  return Object.entries(dictionary);
}

function forms(message: Message): string[] {
  if (typeof message === 'string') {
    return [message];
  }
  return [message.one, message.few, message.many, message.other].filter(
    (form): form is string => form !== undefined,
  );
}

function placeholders(message: Message): string[] {
  const names = new Set<string>();
  for (const form of forms(message)) {
    for (const match of form.matchAll(/\{(\w+)\}/g)) {
      names.add(match[1] ?? '');
    }
  }
  return [...names].sort();
}

describe('dictionaries (G-14: no key without a translation)', () => {
  const ruEntries = entries(ru);
  const enEntries = entries(en);

  it('RU and EN have exactly the same keys', () => {
    expect(enEntries.map(([k]) => k).sort()).toEqual(ruEntries.map(([k]) => k).sort());
  });

  it('no message is empty', () => {
    for (const [key, message] of [...ruEntries, ...enEntries]) {
      for (const form of forms(message)) {
        expect(form.trim(), key).not.toBe('');
      }
    }
  });

  it('both languages use the same placeholders', () => {
    for (const [key, message] of ruEntries) {
      const other = en[key as keyof typeof en];
      expect(placeholders(other), key).toEqual(placeholders(message));
    }
  });

  it('plural messages have the forms their language needs and always {n}', () => {
    for (const [key, message] of ruEntries) {
      if (typeof message === 'string') {
        continue;
      }
      expect(Object.keys(message).sort(), `ru ${key}`).toEqual(['few', 'many', 'one', 'other']);
      for (const form of forms(message)) {
        expect(form, `ru ${key}`).toContain('{n}');
      }
    }
    for (const [key, message] of enEntries) {
      if (typeof message === 'string') {
        continue;
      }
      expect(Object.keys(message).sort(), `en ${key}`).toEqual(['one', 'other']);
    }
  });

  it('a key is plural in both languages or in neither', () => {
    for (const [key, message] of ruEntries) {
      expect(typeof en[key as keyof typeof en], key).toBe(typeof message);
    }
  });

  it('keys follow area.name (or area.group.name)', () => {
    for (const [key] of ruEntries) {
      expect(key).toMatch(/^[a-z]+(\.[a-zA-Z0-9_]+)+$/);
    }
  });
});
