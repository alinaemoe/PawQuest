import { buildReport, type ReportSection } from '@pawquest/data';
import { createI18n } from '@pawquest/i18n';
import { reportHtml, ReportSheet, type ReportDays, type ReportLanguage } from '@pawquest/screens';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';

import { useApp } from './AppContext';
import { FONT_ASSETS } from './fonts';

const DAY_MS = 86_400_000;
/** A4 at 72 points to the inch, what expo-print takes. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

/** The faces the report is set in: the headings in Unbounded, the text in Onest. */
const FACES: readonly {
  readonly family: string;
  readonly weight: number;
  readonly key: keyof typeof FONT_ASSETS;
}[] = [
  { family: 'Onest', weight: 400, key: 'Onest_400Regular' },
  { family: 'Onest', weight: 600, key: 'Onest_600SemiBold' },
  { family: 'Unbounded', weight: 500, key: 'Unbounded_500Medium' },
  { family: 'Unbounded', weight: 600, key: 'Unbounded_600SemiBold' },
];

/** The fonts of the app as `@font-face` rules with the data inside; empty if any cannot be read. */
async function embeddedFonts(): Promise<string> {
  try {
    const rules = await Promise.all(
      FACES.map(async (face) => {
        const asset = await Asset.fromModule(FONT_ASSETS[face.key]).downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        const data = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return `@font-face{font-family:'${face.family}';font-weight:${String(face.weight)};src:url(data:font/ttf;base64,${data}) format('truetype');}`;
      }),
    );
    return rules.join('\n');
  } catch {
    // the system fonts serve: a plainer report is better than none
    return '';
  }
}

const stamp = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** "Report for a specialist": options, then a PDF handed to the system "Share" (docs/23, step 3.21). */
export function ReportContainer({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { db, dog, settings } = useApp();
  const [days, setDays] = useState<ReportDays>(90);
  const [sections, setSections] = useState<readonly ReportSection[]>([
    'summary',
    'activity',
    'situations',
    'health',
    'skills',
  ]);
  // the owner's own words stay out unless asked for
  const [includeNotes, setIncludeNotes] = useState(false);
  const [language, setLanguage] = useState<ReportLanguage>(settings.language);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const i18n = createI18n({ locale: settings.language, units: settings.units });

  const make = async (): Promise<void> => {
    if (dog === null) {
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const now = Date.now();
      const chosen: ReportSection[] = includeNotes ? [...sections, 'notes'] : [...sections];
      const data = buildReport(
        db,
        {
          dogId: dog.id,
          fromTs: now - days * DAY_MS,
          toTs: now + 60_000,
          sections: chosen,
          includeNotes,
        },
        now,
      );
      if (data === null) {
        throw new Error('no dog');
      }
      const html = reportHtml(data, createI18n({ locale: language, units: settings.units }), {
        fontCss: await embeddedFonts(),
      });
      const file = await Print.printToFileAsync({
        html,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
      });
      const target = `${FileSystem.cacheDirectory ?? ''}pawquest-report-${dog.name
        .toLowerCase()
        .replace(/[^a-zа-яё0-9]+/gi, '-')}-${stamp(now)}.pdf`;
      await FileSystem.copyAsync({ from: file.uri, to: target });
      await Sharing.shareAsync(target, {
        mimeType: 'application/pdf',
        dialogTitle: i18n.t('report.open'),
        UTI: 'com.adobe.pdf',
      });
    } catch {
      setError(i18n.t('report.error'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <ReportSheet
      visible={visible}
      onClose={onClose}
      days={days}
      onDays={setDays}
      sections={sections}
      onToggleSection={(section) => {
        setSections((current) =>
          current.includes(section) ? current.filter((s) => s !== section) : [...current, section],
        );
      }}
      includeNotes={includeNotes}
      onNotes={setIncludeNotes}
      language={language}
      onLanguage={setLanguage}
      working={working}
      error={error}
      onMake={() => {
        void make();
      }}
    />
  );
}
