import { backupChunks, eventsCsv, listEventTypes, walkGpx, walksCsv } from '@pawquest/data';
import { eventTypeLabel, ExportSheet, type ExportKind } from '@pawquest/screens';
import { Button, useToast } from '@pawquest/rn-ui';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';

import { useApp } from './AppContext';

const stamp = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** Writes a file in the cache and offers it to the system "Share" (a message, the cloud, a disk). */
async function shareFile(
  name: string,
  mimeType: string,
  chunks: Iterable<string>,
  title: string,
): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) {
    file.delete();
  }
  file.create();
  for (const chunk of chunks) {
    file.write(chunk, { append: true });
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: title });
}

/** "Export and backup" in the Dog tab (docs/23, step 3.12). */
export function ExportContainer({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { db, dog, i18n } = useApp();
  const [working, setWorking] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: ExportKind): Promise<void> => {
    if (dog === null) {
      return;
    }
    setWorking(kind);
    setError(null);
    try {
      const now = Date.now();
      const types = new Map(listEventTypes(db, true).map((t) => [t.id, t]));
      const label = (id: string): string => eventTypeLabel(types.get(id), id, i18n);
      if (kind === 'backup') {
        await shareFile(
          `pawquest-backup-${stamp(now)}.json`,
          'application/json',
          backupChunks(db, now),
          i18n.t('export.backup'),
        );
      } else if (kind === 'walks') {
        await shareFile(
          `pawquest-walks-${stamp(now)}.csv`,
          'text/csv',
          [walksCsv(db, dog.id)],
          i18n.t('export.walks'),
        );
      } else {
        await shareFile(
          `pawquest-events-${stamp(now)}.csv`,
          'text/csv',
          [eventsCsv(db, dog.id, label)],
          i18n.t('export.events'),
        );
      }
    } catch {
      setError(i18n.t('export.failed'));
    } finally {
      setWorking(null);
    }
  };

  return (
    <ExportSheet
      visible={visible}
      working={working}
      error={error}
      onClose={onClose}
      onExport={(kind) => {
        void run(kind);
      }}
    />
  );
}

/** The track of one walk as a GPX file, for the walk's details. */
export async function shareWalkGpx(
  db: Parameters<typeof walkGpx>[0],
  walkId: string,
  label: (typeId: string) => string,
  title: string,
): Promise<boolean> {
  const gpx = walkGpx(db, walkId, label);
  if (gpx === null) {
    return false;
  }
  await shareFile(`pawquest-walk-${stamp(Date.now())}.gpx`, 'application/gpx+xml', [gpx], title);
  return true;
}

/** "Track (GPX)" under the map of a walk with a track. */
export function GpxButton({ walkId }: { readonly walkId: string }) {
  const { db, i18n, toastError } = useGpxHelpers();
  const [busy, setBusy] = useState(false);
  const hasTrack =
    Number(
      db.all('SELECT COUNT(*) AS n FROM track_point WHERE walk_id = ? AND excluded = 0', [
        walkId,
      ])[0]?.['n'] ?? 0,
    ) >= 2;
  if (!hasTrack) {
    return null;
  }
  const types = new Map(listEventTypes(db, true).map((t) => [t.id, t]));
  return (
    <Button
      label={busy ? i18n.t('export.working') : i18n.t('export.gpx')}
      tone="ghost"
      icon="map"
      disabled={busy}
      onPress={() => {
        setBusy(true);
        shareWalkGpx(
          db,
          walkId,
          (id) => eventTypeLabel(types.get(id), id, i18n),
          i18n.t('export.gpx'),
        )
          .catch(() => {
            toastError();
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    />
  );
}

function useGpxHelpers() {
  const { db, i18n } = useApp();
  const toast = useToast();
  return {
    db,
    i18n,
    toastError: () => {
      toast.show({ message: i18n.t('export.failed') });
    },
  };
}
