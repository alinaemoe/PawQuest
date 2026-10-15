import { logCare, recentValues, type CareKind, type CareSubtype } from '@pawquest/data';
import { useToast } from '@pawquest/rn-ui';
import { CareDoneSheet } from '@pawquest/screens';

import { useApp } from './AppContext';

/** What is being marked as done: a routine of a plan, or a one-off like a vaccination. */
export interface CareTarget {
  readonly planId: string | null;
  readonly kind: CareKind;
  readonly subtype: CareSubtype | null;
  readonly name: string;
  readonly defaultProduct: string | null;
}

const DAY = 86_400_000;

/** The "Done" sheet shared by the Health screen and the Today card. */
export function CareFlow({ target, onClose }: { target: CareTarget | null; onClose: () => void }) {
  const { db, ctx, dog, i18n, bump } = useApp();
  const toast = useToast();
  const dogId = dog?.id ?? '';
  return (
    <CareDoneSheet
      visible={target !== null}
      name={target?.name ?? ''}
      suggestions={target === null ? [] : recentValues(db, dogId, 'product')}
      defaultProduct={target?.defaultProduct ?? null}
      onClose={onClose}
      onSave={({ agoDays, product, dose }) => {
        if (target === null) {
          return;
        }
        logCare(db, ctx, {
          dogId,
          kind: target.kind,
          subtype: target.subtype,
          title: target.name,
          doneAt: ctx.now() - agoDays * DAY,
          planId: target.planId,
          product,
          dose,
        });
        onClose();
        bump();
        toast.show({ message: i18n.t('health.saved') });
      }}
    />
  );
}
