import type { UnitSystem } from '@pawquest/i18n';
import type { VisitReason } from '@pawquest/data';
import type { MessageKey } from '@pawquest/i18n';
import { AppText, Button, Chip, Sheet, SwitchRow, TextField, useI18n } from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { weightToGrams } from './input';

function useResetOnOpen(visible: boolean, reset: () => void): void {
  useEffect(() => {
    if (visible) {
      reset();
    }
    // reset only when the sheet opens, not on every render
  }, [visible]);
}

const WHEN: readonly { readonly key: MessageKey; readonly days: number }[] = [
  { key: 'health.whenToday', days: 0 },
  { key: 'health.whenYesterday', days: 1 },
  { key: 'health.when3d', days: 3 },
  { key: 'health.whenWeek', days: 7 },
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{title}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

export interface CareDoneInput {
  readonly agoDays: number;
  readonly product: string | null;
  readonly dose: string | null;
}

export interface CareDoneSheetProps {
  readonly visible: boolean;
  readonly name: string;
  /** Products used before, most recent first; one tap fills the field. */
  readonly suggestions: readonly string[];
  readonly defaultProduct: string | null;
  readonly onClose: () => void;
  readonly onSave: (input: CareDoneInput) => void;
}

/** "Done" for a routine: when, with what. Two taps with the last product preselected. */
export function CareDoneSheet({
  visible,
  name,
  suggestions,
  defaultProduct,
  onClose,
  onSave,
}: CareDoneSheetProps) {
  const i18n = useI18n();
  const [agoDays, setAgoDays] = useState(0);
  const [product, setProduct] = useState('');
  const [dose, setDose] = useState('');
  useResetOnOpen(visible, () => {
    setAgoDays(0);
    setProduct(defaultProduct ?? '');
    setDose('');
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('health.doneTitle', { name })}>
      <Group title={i18n.t('health.when')}>
        {WHEN.map((w) => (
          <Chip
            key={w.key}
            label={i18n.t(w.key)}
            selected={agoDays === w.days}
            onPress={() => {
              setAgoDays(w.days);
            }}
          />
        ))}
      </Group>
      <TextField label={i18n.t('health.product')} value={product} onChangeText={setProduct} />
      {suggestions.length === 0 ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {suggestions.map((s) => (
            <Chip
              key={s}
              size="sm"
              label={s}
              selected={product === s}
              onPress={() => {
                setProduct(s);
              }}
            />
          ))}
        </View>
      )}
      <TextField label={i18n.t('health.dose')} value={dose} onChangeText={setDose} />
      <Button
        label={i18n.t('common.save')}
        onPress={() => {
          onSave({
            agoDays,
            product: product.trim() === '' ? null : product.trim(),
            dose: dose.trim() === '' ? null : dose.trim(),
          });
        }}
      />
    </Sheet>
  );
}

export interface PlanToggle {
  readonly key: string;
  readonly title: string;
  readonly hint: string;
  readonly enabled: boolean;
}

export interface PlansSheetProps {
  readonly visible: boolean;
  readonly plans: readonly PlanToggle[];
  readonly onClose: () => void;
  readonly onToggle: (key: string, enabled: boolean) => void;
}

/** Switch routines on and off; nothing is on until the owner says so (docs/17 §17.2). */
export function PlansSheet({ visible, plans, onClose, onToggle }: PlansSheetProps) {
  const i18n = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('health.setupTitle')}>
      <AppText variant="muted">{i18n.t('health.setupText')}</AppText>
      {plans.map((plan) => (
        <SwitchRow
          key={plan.key}
          label={plan.title}
          hint={plan.hint}
          value={plan.enabled}
          onValueChange={(on) => {
            onToggle(plan.key, on);
          }}
        />
      ))}
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {i18n.t('health.template')}
      </AppText>
    </Sheet>
  );
}

export interface VisitInput {
  readonly reason: VisitReason;
  readonly agoDays: number;
  readonly clinic: string | null;
  readonly findings: string | null;
  readonly prescription: string | null;
  readonly weightG: number | null;
  /** Months until the next visit, days, or none. */
  readonly next: 'none' | '12m' | '2w';
}

export interface VisitSheetProps {
  readonly visible: boolean;
  readonly units: UnitSystem;
  readonly initialReason: VisitReason;
  readonly clinics: readonly string[];
  readonly onClose: () => void;
  readonly onSave: (visit: VisitInput) => void;
}

const REASONS: readonly VisitReason[] = ['checkup', 'vaccination', 'problem', 'followup', 'other'];

/** A vet visit: the reason is one tap, everything else is optional (docs/17 S17-V). */
export function VisitSheet({
  visible,
  units,
  initialReason,
  clinics,
  onClose,
  onSave,
}: VisitSheetProps) {
  const i18n = useI18n();
  const [reason, setReason] = useState<VisitReason>(initialReason);
  const [agoDays, setAgoDays] = useState(0);
  const [clinic, setClinic] = useState('');
  const [findings, setFindings] = useState('');
  const [prescription, setPrescription] = useState('');
  const [weight, setWeight] = useState('');
  const [next, setNext] = useState<VisitInput['next']>('none');
  useResetOnOpen(visible, () => {
    setReason(initialReason);
    setAgoDays(0);
    setClinic(clinics[0] ?? '');
    setFindings('');
    setPrescription('');
    setWeight('');
    setNext(initialReason === 'checkup' || initialReason === 'vaccination' ? '12m' : 'none');
  });
  const weightG = weightToGrams(weight, units);
  const weightInvalid = weight.trim() !== '' && weightG === null;
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('visit.title')}>
      <Group title={i18n.t('visit.reason')}>
        {REASONS.map((r) => (
          <Chip
            key={r}
            label={i18n.t(`visit.${r}` as MessageKey)}
            selected={reason === r}
            onPress={() => {
              setReason(r);
              setNext(
                r === 'checkup' || r === 'vaccination' ? '12m' : next === '12m' ? 'none' : next,
              );
            }}
          />
        ))}
      </Group>
      <Group title={i18n.t('health.when')}>
        {WHEN.map((w) => (
          <Chip
            key={w.key}
            label={i18n.t(w.key)}
            selected={agoDays === w.days}
            onPress={() => {
              setAgoDays(w.days);
            }}
          />
        ))}
      </Group>
      <TextField label={i18n.t('visit.clinic')} value={clinic} onChangeText={setClinic} />
      {clinics.length === 0 ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {clinics.map((c) => (
            <Chip
              key={c}
              size="sm"
              label={c}
              selected={clinic === c}
              onPress={() => {
                setClinic(c);
              }}
            />
          ))}
        </View>
      )}
      <TextField
        label={i18n.t('visit.findings')}
        value={findings}
        onChangeText={setFindings}
        multiline
      />
      <TextField
        label={i18n.t('visit.prescription')}
        value={prescription}
        onChangeText={setPrescription}
        multiline
      />
      <TextField
        label={`${i18n.t('visit.weight')} (${units === 'imperial' ? i18n.t('unit.lb') : i18n.t('unit.kg')})`}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        maxLength={6}
      />
      <Group title={i18n.t('visit.next')}>
        {(
          [
            ['none', 'visit.nextNone'],
            ['2w', 'visit.next2w'],
            ['12m', 'visit.next12'],
          ] as const
        ).map(([id, key]) => (
          <Chip
            key={id}
            label={i18n.t(key)}
            selected={next === id}
            onPress={() => {
              setNext(id);
            }}
          />
        ))}
      </Group>
      <Button
        label={i18n.t('common.save')}
        disabled={weightInvalid}
        onPress={() => {
          onSave({
            reason,
            agoDays,
            clinic: clinic.trim() === '' ? null : clinic.trim(),
            findings: findings.trim() === '' ? null : findings.trim(),
            prescription: prescription.trim() === '' ? null : prescription.trim(),
            weightG,
            next,
          });
        }}
      />
    </Sheet>
  );
}
