import { AppText, Button, Sheet, useI18n } from '@pawquest/rn-ui';
import { View } from 'react-native';

export type ExportKind = 'backup' | 'walks' | 'events';

export interface ExportSheetProps {
  readonly visible: boolean;
  /** The file being made now, or null. */
  readonly working: ExportKind | null;
  /** What went wrong the last time, or null. */
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onExport: (kind: ExportKind) => void;
}

/** Export and backup (docs/23, step 3.12): what each file is for, one button each. */
export function ExportSheet({ visible, working, error, onClose, onExport }: ExportSheetProps) {
  const i18n = useI18n();
  const item = (kind: ExportKind, title: string, hint: string) => (
    <View key={kind} style={{ gap: 6 }}>
      <Button
        label={working === kind ? i18n.t('export.working') : title}
        tone={kind === 'backup' ? 'primary' : 'ghost'}
        disabled={working !== null}
        onPress={() => {
          onExport(kind);
        }}
      />
      <AppText variant="muted">{hint}</AppText>
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('export.title')}>
      <View style={{ gap: 14 }}>
        <AppText variant="muted">{i18n.t('export.hint')}</AppText>
        {item('backup', i18n.t('export.backup'), i18n.t('export.backupHint'))}
        {item('walks', i18n.t('export.walks'), i18n.t('export.walksHint'))}
        {item('events', i18n.t('export.events'), i18n.t('export.eventsHint'))}
        {error === null ? null : <AppText>{error}</AppText>}
      </View>
    </Sheet>
  );
}
