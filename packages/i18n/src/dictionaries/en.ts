import type { Message } from '../types';
import type { MessageKey } from './ru';

export const en = {
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.undo': 'Undo',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.skip': 'Skip',
  'common.done': 'Done',
  'common.later': 'Later',
  'common.allow': 'Allow',

  'tab.today': 'Today',
  'tab.walks': 'Walks',
  'tab.training': 'Training',
  'tab.insights': 'Insights',
  'tab.dog': 'Dog',

  'time.today': 'today',
  'time.yesterday': 'yesterday',
  'time.justNow': 'just now',
  'time.minutesAgo': { one: '{n} minute ago', other: '{n} minutes ago' },
  'time.hoursAgo': { one: '{n} hour ago', other: '{n} hours ago' },
  'time.daysAgo': { one: '{n} day ago', other: '{n} days ago' },

  'unit.m': 'm',
  'unit.km': 'km',
  'unit.ft': 'ft',
  'unit.mi': 'mi',
  'unit.kg': 'kg',
  'unit.lb': 'lb',
  'unit.h': 'h',
  'unit.min': 'min',
  'unit.s': 's',
  'unit.perKm': '/km',
  'unit.perMi': '/mi',
} as const satisfies Record<MessageKey, Message>;
