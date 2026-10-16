import { AppText, Card, Sheet, useI18n, useTheme } from '@pawquest/rn-ui';
import { mix } from '@pawquest/ui';
import { Pressable, View, useWindowDimensions } from 'react-native';

import type { CalendarCellModel, CalendarModel, DayRowModel, MemoryModel } from './calendarModel';
import { PhotoStrip } from './PhotoViews';

const GAP = 4;
const LABEL_WIDTH = 44;
/** How much of the accent colour each level takes. */
const SHARE = [0, 0.28, 0.5, 0.75, 1] as const;

export interface WalkCalendarProps {
  readonly model: CalendarModel;
  readonly onDay: (cell: CalendarCellModel) => void;
}

/** Weeks as rows, days as squares: the more time on foot, the deeper the colour. */
export function WalkCalendar({ model, onDay }: WalkCalendarProps) {
  const { colors } = useTheme().theme;
  const { width } = useWindowDimensions();
  const cell = Math.max(20, Math.floor((width - 32 - 28 - LABEL_WIDTH - GAP * 6) / 7));
  return (
    <View style={{ gap: GAP }}>
      <View style={{ flexDirection: 'row', gap: GAP, paddingLeft: LABEL_WIDTH }}>
        {model.weekdays.map((w, i) => (
          <View key={String(i)} style={{ width: cell, alignItems: 'center' }}>
            <AppText variant="muted" style={{ fontSize: 11 }}>
              {w}
            </AppText>
          </View>
        ))}
      </View>
      {model.rows.map((row) => (
        <View
          key={row.label + String(row.cells.length)}
          style={{ flexDirection: 'row', gap: GAP, alignItems: 'center' }}
        >
          <View style={{ width: LABEL_WIDTH }}>
            <AppText variant="muted" style={{ fontSize: 11 }}>
              {row.label}
            </AppText>
          </View>
          {row.cells.map((c, i) =>
            c === null ? (
              <View key={String(i)} style={{ width: cell, height: cell }} />
            ) : (
              <Pressable
                key={String(c.day)}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                onPress={() => {
                  onDay(c);
                }}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 8,
                  backgroundColor: mix(colors.surface2, colors.accent, SHARE[c.level]),
                  borderWidth: c.isToday ? 2 : 0,
                  borderColor: colors.ink,
                }}
              />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

export interface DayWalksSheetProps {
  /** The day opened: its title ("12 октября"), null when closed. */
  readonly title: string | null;
  readonly rows: readonly DayRowModel[];
  readonly onClose: () => void;
}

/** What a tap on a calendar cell shows: the walks of that day. */
export function DayWalksSheet({ title, rows, onClose }: DayWalksSheetProps) {
  const i18n = useI18n();
  if (title === null) {
    return null;
  }
  return (
    <Sheet visible onClose={onClose} title={title}>
      {rows.length === 0 ? (
        <AppText variant="muted">{i18n.t('calendar.dayEmpty')}</AppText>
      ) : (
        rows.map((row) => <AppText key={row.key}>{row.text}</AppText>)
      )}
    </Sheet>
  );
}

export interface MemoriesCardProps {
  readonly memories: readonly MemoryModel[];
  readonly onOpenPhoto: (photos: MemoryModel['photos'], index: number) => void;
}

/** "On this day": what happened on today's date in earlier years. Nothing is drawn without a memory. */
export function MemoriesCard({ memories, onOpenPhoto }: MemoriesCardProps) {
  const i18n = useI18n();
  if (memories.length === 0) {
    return null;
  }
  return (
    <Card variant="stripe">
      <AppText variant="eyebrow">{i18n.t('memories.title')}</AppText>
      <View style={{ gap: 12 }}>
        {memories.map((memory) => (
          <View key={memory.key} style={{ gap: 6 }}>
            <AppText weight={600}>{memory.heading}</AppText>
            {memory.walksLine === null ? null : <AppText>{memory.walksLine}</AppText>}
            <PhotoStrip
              photos={memory.photos}
              onOpen={(index) => {
                onOpenPhoto(memory.photos, index);
              }}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}
