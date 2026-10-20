import { AppText, Card, Chip, useI18n } from '@pawquest/rn-ui';
import { Pressable, View } from 'react-native';

import { REPLAY_SPEEDS } from './ReplayViews';
import type { CompareRow, CompareSync } from './replayCompare';

/** The parts of the "Two walks" screen (docs/23, step 3.20): the table, the sync switch, the picker. */

export interface CompareTableProps {
  /** What each walk has at the moment on the slider. */
  readonly live: readonly CompareRow[];
  /** The walks as wholes. */
  readonly rows: readonly CompareRow[];
  readonly colorA: string;
  readonly colorB: string;
  /** "Первая впереди на 120 м" at the moment on the slider. */
  readonly lead: string;
}

function Dot({ color }: { readonly color: string }) {
  return <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />;
}

/** The two walks in numbers, side by side, each under its own colour. */
export function CompareTable({ live, rows, colorA, colorB, lead }: CompareTableProps) {
  const i18n = useI18n();
  return (
    <Card variant="flat">
      <View style={{ gap: 10 }}>
        <AppText weight={600}>{lead}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1.1 }} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dot color={colorA} />
            <AppText variant="eyebrow">{i18n.t('twowalks.first')}</AppText>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dot color={colorB} />
            <AppText variant="eyebrow">{i18n.t('twowalks.second')}</AppText>
          </View>
        </View>
        {live.map((row) => (
          <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AppText variant="muted" style={{ flex: 1.1 }}>
              {row.label}
            </AppText>
            <AppText style={{ flex: 1 }}>{row.a}</AppText>
            <AppText style={{ flex: 1 }}>{row.b}</AppText>
          </View>
        ))}
        <AppText variant="eyebrow">{i18n.t('twowalks.wholeWalks')}</AppText>
        {rows.map((row) => (
          <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AppText variant="muted" style={{ flex: 1.1 }}>
              {row.label}
            </AppText>
            <AppText style={{ flex: 1 }}>{row.a}</AppText>
            <AppText style={{ flex: 1 }}>{row.b}</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

export interface CompareControlsProps {
  readonly playing: boolean;
  readonly speed: number;
  readonly sync: CompareSync;
  readonly onPlay: () => void;
  readonly onSpeed: (speed: number) => void;
  readonly onSync: (sync: CompareSync) => void;
  readonly onChange: () => void;
}

/** Play, speed, and how the two walks are lined up (by progress or by time from the start). */
export function CompareControls({
  playing,
  speed,
  sync,
  onPlay,
  onSpeed,
  onSync,
  onChange,
}: CompareControlsProps) {
  const i18n = useI18n();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          size="sm"
          lead={playing ? 'pause' : 'play'}
          label={i18n.t(playing ? 'replay.pause' : 'replay.play')}
          selected={playing}
          onPress={onPlay}
        />
        {REPLAY_SPEEDS.map((s) => (
          <Chip
            key={s}
            size="sm"
            label={`${String(s)}×`}
            selected={speed === s}
            onPress={() => {
              onSpeed(s);
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip
          size="sm"
          label={i18n.t('twowalks.syncProgress')}
          selected={sync === 'progress'}
          onPress={() => {
            onSync('progress');
          }}
        />
        <Chip
          size="sm"
          label={i18n.t('twowalks.syncTime')}
          selected={sync === 'time'}
          onPress={() => {
            onSync('time');
          }}
        />
        <Chip size="sm" lead="map" label={i18n.t('twowalks.change')} onPress={onChange} />
      </View>
      <AppText variant="muted">
        {i18n.t(sync === 'progress' ? 'twowalks.syncProgressNote' : 'twowalks.syncTimeNote')}
      </AppText>
    </View>
  );
}

export interface CandidateRow {
  readonly key: string;
  /** "Сб, 12 окт · 36 мин · 2,2 км" */
  readonly title: string;
  readonly place: string | null;
  readonly samePlace: boolean;
}

export interface CandidateListProps {
  readonly candidates: readonly CandidateRow[];
  readonly onPick: (key: string) => void;
}

/** The walks to put beside this one: the same place first, each a tap. */
export function CandidateList({ candidates, onPick }: CandidateListProps) {
  const i18n = useI18n();
  if (candidates.length === 0) {
    return <AppText variant="muted">{i18n.t('twowalks.none')}</AppText>;
  }
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="muted">{i18n.t('twowalks.pickNote')}</AppText>
      {candidates.map((c) => (
        <Pressable
          key={c.key}
          accessibilityRole="button"
          onPress={() => {
            onPick(c.key);
          }}
          style={{ paddingVertical: 10, gap: 2 }}
        >
          <AppText>{c.title}</AppText>
          {c.place === null && !c.samePlace ? null : (
            <AppText variant="muted">
              {c.samePlace ? `${i18n.t('twowalks.samePlace')} · ` : ''}
              {c.place ?? ''}
            </AppText>
          )}
        </Pressable>
      ))}
    </View>
  );
}
