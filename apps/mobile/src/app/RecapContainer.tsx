import { weekBounds, weekRecap } from '@pawquest/data';
import { PhotoViewer, recapDelta, WeekRecapScreen, type WeekRecapModel } from '@pawquest/screens';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';

const WEEK = 7 * 86_400_000;

/** Dog -> Week in review: the card of one week, with arrows to earlier and later weeks. */
export function RecapContainer({ dogId, onBack }: { dogId: string; onBack: () => void }) {
  const { db, i18n, version } = useApp();
  const [back, setBack] = useState(0);
  const [viewing, setViewing] = useState(false);

  const data = useMemo(() => {
    const now = Date.now();
    const bounds = weekBounds(now, -new Date(now).getTimezoneOffset());
    const from = bounds.from - back * WEEK;
    const to = from + WEEK;
    const recap = weekRecap(db, dogId, from, to);
    const range = `${i18n.formatDate(from, now)} – ${i18n.formatDate(to - 1, now)}`;
    if (recap.totals.count === 0) {
      return { range, model: null, photo: null };
    }
    const delta = recapDelta(
      recap.totals.distanceM,
      recap.previous.distanceM,
      recap.previous.count,
    );
    const versus =
      delta.kind === 'none'
        ? i18n.t('recap.vsNone')
        : delta.kind === 'same'
          ? i18n.t('recap.vsSame')
          : i18n.t(delta.kind === 'more' ? 'recap.vsMore' : 'recap.vsLess', {
              delta: i18n.formatDistance(delta.distanceM),
            });
    const day = (ts: number): string => i18n.formatDay(ts, now);
    const photo = recap.photo === null ? null : { id: recap.photo.id, uri: recap.photo.uri };
    const model: WeekRecapModel = {
      range,
      walksLabel: i18n.t('walks.count', { n: recap.totals.count }),
      distance: i18n.formatDistance(recap.totals.distanceM),
      duration: i18n.formatDuration(recap.totals.durationS),
      versus,
      successes: recap.successCount,
      hard: recap.hardCount,
      calm:
        recap.calm === null
          ? null
          : i18n.t('recap.calmValue', {
              duration: i18n.formatDuration(Math.round(recap.calm.durationMs / 1000)),
              day: day(recap.calm.startedAt),
            }),
      longest:
        recap.longest === null
          ? null
          : i18n.t('recap.longestValue', {
              duration: i18n.formatDuration(recap.longest.durationS ?? 0),
              day: day(recap.longest.startedAt),
            }),
      photo,
      photoCount: recap.photoCount,
    };
    return { range, model, photo };
  }, [db, dogId, i18n, version, back]);

  return (
    <>
      <WeekRecapScreen
        recap={data.model}
        range={data.range}
        isCurrent={back === 0}
        onBack={onBack}
        onEarlier={() => {
          setBack((n) => n + 1);
        }}
        onLater={() => {
          setBack((n) => Math.max(0, n - 1));
        }}
        onOpenPhoto={() => {
          setViewing(true);
        }}
      />
      <PhotoViewer
        photos={data.photo === null ? [] : [data.photo]}
        openAt={viewing && data.photo !== null ? 0 : null}
        onClose={() => {
          setViewing(false);
        }}
        onRemove={() => undefined}
        canRemove={false}
      />
    </>
  );
}
