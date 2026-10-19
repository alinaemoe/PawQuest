import {
  SPEED_ZONES,
  MIN_ZONE_SHOWN_S,
  zoneShare,
  type SpeedProfile,
  type SpeedZone,
} from '@pawquest/core';
import type { I18n, MessageKey } from '@pawquest/i18n';

import type { ReplayFrame } from './replayEngine';

/** The words of the Replay screen (docs/04, S07-St, S07-Sp, S07-Z, S07-Pr; A-25). */

export interface ReplayReadout {
  /** "12:30 / 1:42:00": where we are and how long the walk is on the axis. */
  readonly clock: string;
  readonly distance: string;
  /** "3,2 км/ч · шаг", or "стоим" where the speed is unknown. */
  readonly speed: string;
  readonly events: string;
  readonly pass: string | null;
  /** "Парк › Поляна": where the walk is now by the saved places, or null. */
  readonly place: string | null;
}

const mpsToMinPerKm = (mps: number): number | null => (mps < 0.4 ? null : 1000 / (mps * 60));

export function speedText(mps: number | null, zone: SpeedZone, i18n: I18n): string {
  if (mps === null) {
    return i18n.t('replay.standing');
  }
  const pace = mpsToMinPerKm(mps);
  return pace === null
    ? i18n.t('replay.zone.standing')
    : `${i18n.formatSpeed(pace)} · ${i18n.t(`replay.zone.${zone}` as MessageKey)}`;
}

export function replayReadout(
  frame: ReplayFrame,
  axisMs: number,
  lengthMs: number,
  eventCount: number,
  i18n: I18n,
): ReplayReadout {
  return {
    clock: `${i18n.formatClock(axisMs / 1000)} / ${i18n.formatClock(lengthMs / 1000)}`,
    distance: i18n.formatDistance(frame.distanceM),
    speed: speedText(frame.speedMps, frame.zone, i18n),
    events: i18n.t('replay.events', { n: frame.eventsSoFar, total: eventCount }),
    place: frame.places.length === 0 ? null : frame.places.join(' › '),
    pass:
      frame.pass === null
        ? null
        : i18n.t(
            frame.pass.direction === 'forward' ? 'replay.pass.forward' : 'replay.pass.backward',
            { route: frame.pass.routeName },
          ),
  };
}

export interface ZoneRowModel {
  readonly zone: SpeedZone;
  readonly label: string;
  /** "12 мин · 40%". */
  readonly value: string;
  /** 0..1 of the known time. */
  readonly share: number;
}

export interface SpeedSummaryModel {
  readonly zones: readonly ZoneRowModel[];
  /** "Ровный темп" / "К концу быстрее" / "К концу медленнее", and the fast start. */
  readonly pattern: string;
  readonly fastStart: string | null;
  /** The profile windows scaled to the fastest one, 0..1, with where each lies on the walk, 0..1. */
  readonly profile: readonly { readonly at: number; readonly level: number }[];
}

/** The summary of the speed of a walk: time in each zone and how the pace changed. */
export function speedSummary(
  profile: SpeedProfile,
  startTs: number,
  endTs: number,
  i18n: I18n,
): SpeedSummaryModel {
  const zones = SPEED_ZONES.flatMap((zone): ZoneRowModel[] => {
    const seconds = profile.zoneS[zone];
    if (seconds < MIN_ZONE_SHOWN_S) {
      return [];
    }
    const share = zoneShare(profile, zone);
    return [
      {
        zone,
        label: i18n.t(`replay.zone.${zone}` as MessageKey),
        value: `${i18n.formatDuration(seconds)} · ${String(Math.round(share * 100))}%`,
        share,
      },
    ];
  });
  const fastest = Math.max(0.01, ...profile.windows.map((w) => w.mps));
  const span = Math.max(1, endTs - startTs);
  return {
    zones,
    pattern: i18n.t(`replay.pattern.${profile.pattern}` as MessageKey),
    fastStart: profile.fastStart ? i18n.t('replay.fastStart') : null,
    profile: profile.windows.map((w) => ({
      at: Math.min(1, Math.max(0, (w.ts - startTs) / span)),
      level: w.mps / fastest,
    })),
  };
}
