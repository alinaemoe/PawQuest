import {
  CARE_TEMPLATES,
  addWeight,
  careDates,
  createPlan,
  listCareItems,
  listPlans,
  logCare,
  recentValues,
  setPlanEnabled,
  visitCounts,
  type VisitReason,
} from '@pawquest/data';
import type { MessageKey } from '@pawquest/i18n';
import { useToast } from '@pawquest/rn-ui';
import {
  HealthScreen,
  intervalLine,
  intervalText,
  planCard,
  planTitle,
  PlansSheet,
  VisitSheet,
  type PlanToggle,
  type QuickMark,
  type VisitInput,
  type VisitRowModel,
} from '@pawquest/screens';
import { useMemo, useState } from 'react';

import { useApp } from './AppContext';
import type { CareTarget } from './CareFlow';

const DAY = 86_400_000;
const offsetMin = (): number => -new Date().getTimezoneOffset();

export interface HealthContainerProps {
  readonly onBack: () => void;
  readonly openCare: (target: CareTarget) => void;
}

/** The Health screen: upcoming routines, quick marks, vet visits and plain facts (docs/17). */
export function HealthContainer({ onBack, openCare }: HealthContainerProps) {
  const { db, ctx, dog, settings, i18n, version, bump } = useApp();
  const toast = useToast();
  const dogId = dog?.id ?? '';
  const [plansOpen, setPlansOpen] = useState(false);
  const [visit, setVisit] = useState<VisitReason | null>(null);

  const data = useMemo(() => {
    const now = Date.now();
    const plans = listPlans(db, dogId);
    const enabled = plans.filter((p) => p.enabled);
    const stats = enabled
      .map((p) =>
        intervalLine(
          planTitle(p, i18n),
          careDates(db, dogId, p.kind, p.subtype ?? undefined),
          i18n,
        ),
      )
      .filter((line): line is string => line !== null);
    const counts = visitCounts(db, dogId, now - 365 * DAY, now + DAY);
    if (counts.total > 0) {
      stats.push(i18n.t('health.visitsYear', { total: counts.total, problem: counts.problem }));
    }
    const visits: VisitRowModel[] = listCareItems(db, dogId, 5, 'vet_visit').map((item) => ({
      id: item.id,
      title: i18n.t(`visit.${item.visitReason ?? 'other'}` as MessageKey),
      subtitle: [item.clinic, i18n.formatDate(item.doneAt ?? now, now)]
        .filter((p): p is string => p !== null && p !== '')
        .join(' · '),
    }));
    return {
      plans,
      cards: enabled.map((p) => planCard(p, now, offsetMin(), i18n)),
      stats,
      visits,
      clinics: recentValues(db, dogId, 'clinic'),
    };
  }, [db, dogId, i18n, version]);

  const toggles = useMemo<PlanToggle[]>(
    () =>
      CARE_TEMPLATES.map((t) => {
        const existing = data.plans.find((p) => p.templateKey === t.key);
        return {
          key: t.key,
          title: i18n.t(`care.${t.key}` as MessageKey),
          hint:
            existing === undefined
              ? intervalText(
                  {
                    ...t,
                    id: '',
                    dogId,
                    templateKey: t.key,
                    title: '',
                    defaultProduct: null,
                    enabled: false,
                    lastDoneAt: null,
                    lastProduct: null,
                    remindDaysBefore: t.remindDaysBefore,
                  },
                  i18n,
                )
              : intervalText(existing, i18n),
          enabled: existing?.enabled === true,
        };
      }),
    [data.plans, dogId, i18n],
  );

  const togglePlan = (key: string, on: boolean): void => {
    const existing = data.plans.find((p) => p.templateKey === key);
    if (existing !== undefined) {
      setPlanEnabled(db, ctx, existing.id, on);
    } else if (on) {
      const t = CARE_TEMPLATES.find((x) => x.key === key);
      if (t !== undefined) {
        createPlan(db, ctx, {
          dogId,
          templateKey: t.key,
          kind: t.kind,
          subtype: t.subtype,
          title: i18n.t(`care.${t.key}` as MessageKey),
          intervalDays: t.intervalDays,
          intervalMonths: t.intervalMonths,
          seasonFromMonth: t.seasonFromMonth,
          seasonToMonth: t.seasonToMonth,
          remindDaysBefore: t.remindDaysBefore,
        });
      }
    }
    bump();
  };

  const quick = (mark: QuickMark): void => {
    const key = mark === 'deworm' ? 'deworm' : mark === 'tick' ? 'tick_flea' : 'vaccination';
    const t = CARE_TEMPLATES.find((x) => x.key === key);
    if (t === undefined) {
      return;
    }
    const plan = data.plans.find((p) => p.templateKey === key);
    openCare({
      planId: plan?.id ?? null,
      kind: t.kind,
      subtype: t.subtype,
      name: i18n.t(`care.${key}` as MessageKey),
      defaultProduct: plan?.lastProduct ?? plan?.defaultProduct ?? null,
    });
  };

  const saveVisit = (input: VisitInput): void => {
    const doneAt = ctx.now() - input.agoDays * DAY;
    const credited = data.plans.find(
      (p) =>
        (input.reason === 'vaccination' && p.templateKey === 'vaccination') ||
        (input.reason === 'checkup' && p.templateKey === 'checkup'),
    );
    logCare(db, ctx, {
      dogId,
      kind: 'vet_visit',
      title: i18n.t('visit.title'),
      doneAt,
      visitReason: input.reason,
      clinic: input.clinic,
      findings: input.findings,
      prescription: input.prescription,
      planId: credited?.id ?? null,
      nextDue:
        input.next === '12m' ? doneAt + 365 * DAY : input.next === '2w' ? doneAt + 14 * DAY : null,
    });
    if (input.weightG !== null) {
      addWeight(db, ctx, { dogId, weightG: input.weightG, measuredAt: doneAt });
    }
    setVisit(null);
    bump();
    toast.show({ message: i18n.t('visit.saved') });
  };

  return (
    <>
      <HealthScreen
        cards={data.cards}
        visits={data.visits}
        stats={data.stats}
        onBack={onBack}
        onDone={(planId) => {
          const plan = data.plans.find((p) => p.id === planId);
          if (plan !== undefined) {
            openCare({
              planId: plan.id,
              kind: plan.kind,
              subtype: plan.subtype,
              name: planTitle(plan, i18n),
              defaultProduct: plan.lastProduct ?? plan.defaultProduct,
            });
          }
        }}
        onSetup={() => {
          setPlansOpen(true);
        }}
        onQuick={quick}
        onVisit={() => {
          setVisit('checkup');
        }}
      />
      <PlansSheet
        visible={plansOpen}
        plans={toggles}
        onClose={() => {
          setPlansOpen(false);
        }}
        onToggle={togglePlan}
      />
      <VisitSheet
        visible={visit !== null}
        units={settings.units}
        initialReason={visit ?? 'checkup'}
        clinics={data.clinics}
        onClose={() => {
          setVisit(null);
        }}
        onSave={saveVisit}
      />
    </>
  );
}
