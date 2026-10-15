export type Locale = 'ru' | 'en';
export type UnitSystem = 'metric' | 'imperial';

/** Plural forms of one message. Russian uses one/few/many, English one/other; `other` is always required. */
export interface PluralMessage {
  readonly one: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

export type Message = string | PluralMessage;

export type PluralCategory = 'one' | 'few' | 'many' | 'other';

export type Params = Readonly<Record<string, string | number>>;
