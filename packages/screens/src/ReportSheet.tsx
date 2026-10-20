import type { ReportSection } from '@pawquest/data';
import type { MessageKey } from '@pawquest/i18n';
import { AppText, Button, Chip, Sheet, SwitchRow, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

export type ReportDays = 30 | 90 | 180 | 365;
export type ReportLanguage = 'ru' | 'en';

export const REPORT_DAYS: readonly ReportDays[] = [30, 90, 180, 365];
/** The sections the owner can switch; the notes have their own switch, off by default. */
export const REPORT_PICKABLE: readonly ReportSection[] = [
  'summary',
  'activity',
  'situations',
  'health',
  'skills',
];

export interface ReportSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly days: ReportDays;
  readonly onDays: (days: ReportDays) => void;
  readonly sections: readonly ReportSection[];
  readonly onToggleSection: (section: ReportSection) => void;
  readonly includeNotes: boolean;
  readonly onNotes: (value: boolean) => void;
  readonly language: ReportLanguage;
  readonly onLanguage: (language: ReportLanguage) => void;
  readonly working: boolean;
  readonly error: string | null;
  readonly onMake: () => void;
}

/** The report for a specialist (docs/23, step 3.21): the period, the sections, the language, one button. */
export function ReportSheet(props: ReportSheetProps) {
  const i18n = useI18n();
  const label = (text: string) => <AppText variant="eyebrow">{text}</AppText>;
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title={i18n.t('report.sheet.title')}>
      <View style={{ gap: 14 }}>
        <AppText variant="muted">{i18n.t('report.sheet.intro')}</AppText>
        {label(i18n.t('report.period'))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REPORT_DAYS.map((d) => (
            <Chip
              key={d}
              label={i18n.t(`report.period.${String(d)}` as MessageKey)}
              selected={props.days === d}
              onPress={() => {
                props.onDays(d);
              }}
            />
          ))}
        </View>
        {label(i18n.t('report.sections'))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REPORT_PICKABLE.map((s) => (
            <Chip
              key={s}
              label={i18n.t(`report.section.${s}` as MessageKey)}
              selected={props.sections.includes(s)}
              onPress={() => {
                props.onToggleSection(s);
              }}
            />
          ))}
        </View>
        <SwitchRow
          label={i18n.t('report.notes.include')}
          hint={i18n.t('report.notes.hint')}
          value={props.includeNotes}
          onValueChange={props.onNotes}
        />
        {label(i18n.t('report.language'))}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip
            label="Русский"
            selected={props.language === 'ru'}
            onPress={() => {
              props.onLanguage('ru');
            }}
          />
          <Chip
            label="English"
            selected={props.language === 'en'}
            onPress={() => {
              props.onLanguage('en');
            }}
          />
        </View>
        {props.error === null ? null : <AppText variant="muted">{props.error}</AppText>}
        <Button
          label={i18n.t(props.working ? 'report.making' : 'report.make')}
          disabled={props.working || props.sections.length === 0}
          onPress={props.onMake}
        />
      </View>
    </Sheet>
  );
}
