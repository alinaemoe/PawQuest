import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Same guard as in @pawquest/core: Hermes lacks some APIs that Node has (see that file). */
const FORBIDDEN: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bIntl\.Segmenter\b/, why: 'Intl.Segmenter is not implemented in Hermes' },
  { pattern: /\bIntl\.DurationFormat\b/, why: 'Intl.DurationFormat is not available in Hermes' },
  { pattern: /\bIntl\.ListFormat\b/, why: 'Intl.ListFormat is not reliably available in Hermes' },
  { pattern: /\bArray\.fromAsync\b/, why: 'Array.fromAsync is not available in Hermes' },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('Hermes compatibility guard', () => {
  const files = sourceFiles(fileURLToPath(new URL('.', import.meta.url)));

  it('scans the production sources', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(FORBIDDEN.map((f) => [f.pattern.source, f] as const))(
    'no production code uses %s',
    (_source, rule) => {
      const offenders = files.filter((file) => rule.pattern.test(readFileSync(file, 'utf8')));
      expect(offenders, rule.why).toEqual([]);
    },
  );
});
