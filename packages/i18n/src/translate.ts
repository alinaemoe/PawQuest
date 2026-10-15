import type { MessageKey } from './dictionaries/ru';
import { pluralCategory } from './plural';
import type { Locale, Message, Params } from './types';

export type Dictionary = Readonly<Record<MessageKey, Message>>;

function fill(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Looks a message up and fills `{placeholders}`. A plural message picks its form from the number in
 * `params.n`; a missing form falls back to `other`.
 */
export function translate(
  locale: Locale,
  dictionary: Dictionary,
  key: MessageKey,
  params: Params = {},
): string {
  const message = dictionary[key];
  if (typeof message === 'string') {
    return fill(message, params);
  }
  const n = params['n'];
  const category = typeof n === 'number' ? pluralCategory(locale, n) : 'other';
  return fill(message[category] ?? message.other, params);
}
