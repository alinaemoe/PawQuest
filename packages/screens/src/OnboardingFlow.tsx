import type { DogSize, GoalKey, Sex } from '@pawquest/data';
import { AppText, Avatar, Button, Chip, TextField, useI18n, useTheme } from '@pawquest/rn-ui';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface DogDraft {
  readonly name: string;
  readonly ageYears: number | null;
  readonly ageMonths: number | null;
  readonly size: DogSize | null;
  readonly sex: Sex | null;
  readonly breed: string;
  readonly goals: readonly GoalKey[];
}

export interface OnboardingFlowProps {
  /** Finished: create the dog. `openWalk` is true when the user chose "log the first walk". */
  readonly onFinish: (draft: DogDraft, openWalk: boolean) => void;
  readonly onDemo: () => void;
  /** Asks the system for location and notifications; resolves when the user has answered. */
  readonly onRequestPermissions: () => Promise<void>;
}

type Step = 'welcome' | 'name' | 'about' | 'goals' | 'perms' | 'done';
const ORDER: readonly Step[] = ['welcome', 'name', 'about', 'goals', 'perms', 'done'];
const SIZES: readonly DogSize[] = ['small', 'medium', 'large', 'giant'];
const SEXES: readonly Sex[] = ['female', 'male', 'unknown'];
const GOALS: readonly GoalKey[] = [
  'recall',
  'leash',
  'impulse',
  'calm',
  'social',
  'activity',
  'diary',
];

function parseWhole(text: string): number | null {
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
}

/** First-run flow (spec S00): a name is all that is required, everything else can be skipped. */
export function OnboardingFlow({ onFinish, onDemo, onRequestPermissions }: OnboardingFlowProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [years, setYears] = useState('');
  const [months, setMonths] = useState('');
  const [size, setSize] = useState<DogSize | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [breed, setBreed] = useState('');
  const [goals, setGoals] = useState<readonly GoalKey[]>([]);
  const [busy, setBusy] = useState(false);

  const index = ORDER.indexOf(step);
  const go = (delta: number): void => {
    setStep(ORDER[Math.min(ORDER.length - 1, Math.max(0, index + delta))] ?? 'welcome');
  };
  const finish = (openWalk: boolean): void => {
    onFinish(
      {
        name: name.trim(),
        ageYears: parseWhole(years),
        ageMonths: parseWhole(months),
        size,
        sex,
        breed: breed.trim(),
        goals,
      },
      openWalk,
    );
  };
  const canContinueName = name.trim() !== '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 24,
          paddingHorizontal: 20,
          paddingBottom: 24,
          gap: 16,
        }}
      >
        {step === 'welcome' ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Chip
              size="sm"
              label={i18n.t('common.back')}
              onPress={() => {
                go(-1);
              }}
            />
            <AppText variant="muted">
              {i18n.t('onb.step', { current: index, total: ORDER.length - 1 })}
            </AppText>
          </View>
        )}

        {step === 'welcome' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
            <Avatar size={96} />
            <AppText variant="numBig" style={{ textAlign: 'center', fontSize: 24, lineHeight: 32 }}>
              {i18n.t('onb.welcomeTitle')}
            </AppText>
            <AppText variant="muted" style={{ textAlign: 'center' }}>
              {i18n.t('onb.welcomeText')}
            </AppText>
          </View>
        ) : null}

        {step === 'name' ? (
          <View style={{ gap: 16 }}>
            <AppText variant="numBig" style={{ fontSize: 22, lineHeight: 30 }}>
              {i18n.t('onb.nameTitle')}
            </AppText>
            <TextField
              label={i18n.t('onb.nameLabel')}
              placeholder={i18n.t('onb.namePlaceholder')}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => {
                if (canContinueName) {
                  go(1);
                }
              }}
            />
          </View>
        ) : null}

        {step === 'about' ? (
          <View style={{ gap: 16 }}>
            <AppText variant="numBig" style={{ fontSize: 22, lineHeight: 30 }}>
              {i18n.t('onb.aboutTitle')}
            </AppText>
            <AppText variant="muted">{i18n.t('onb.aboutHint')}</AppText>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={i18n.t('onb.ageYears')}
                  value={years}
                  onChangeText={setYears}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={i18n.t('onb.ageMonths')}
                  value={months}
                  onChangeText={setMonths}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <AppText variant="eyebrow">{i18n.t('onb.size')}</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SIZES.map((s) => (
                  <Chip
                    key={s}
                    label={i18n.t(`size.${s}`)}
                    selected={size === s}
                    onPress={() => {
                      setSize(size === s ? null : s);
                    }}
                  />
                ))}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <AppText variant="eyebrow">{i18n.t('onb.sex')}</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SEXES.map((s) => (
                  <Chip
                    key={s}
                    label={i18n.t(`sex.${s}`)}
                    selected={sex === s}
                    onPress={() => {
                      setSex(sex === s ? null : s);
                    }}
                  />
                ))}
              </View>
            </View>
            <TextField label={i18n.t('onb.breed')} value={breed} onChangeText={setBreed} />
          </View>
        ) : null}

        {step === 'goals' ? (
          <View style={{ gap: 16 }}>
            <AppText variant="numBig" style={{ fontSize: 22, lineHeight: 30 }}>
              {i18n.t('onb.goalsTitle')}
            </AppText>
            <AppText variant="muted">{i18n.t('onb.goalsHint')}</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {GOALS.map((g) => (
                <Chip
                  key={g}
                  label={i18n.t(`goal.${g}`)}
                  selected={goals.includes(g)}
                  onPress={() => {
                    setGoals(goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g]);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        {step === 'perms' ? (
          <View style={{ gap: 16 }}>
            <AppText variant="numBig" style={{ fontSize: 22, lineHeight: 30 }}>
              {i18n.t('onb.permTitle')}
            </AppText>
            <AppText>{i18n.t('onb.permLocation')}</AppText>
            <AppText>{i18n.t('onb.permNotifications')}</AppText>
          </View>
        ) : null}

        {step === 'done' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            <Avatar size={96} />
            <AppText variant="numBig" style={{ fontSize: 24, textAlign: 'center' }}>
              {i18n.t('onb.doneTitle')}
            </AppText>
            <AppText variant="muted" style={{ textAlign: 'center' }}>
              {i18n.t('onb.doneText')}
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 8 }}>
        {step === 'welcome' ? (
          <>
            <Button
              label={i18n.t('onb.start')}
              size="lg"
              onPress={() => {
                go(1);
              }}
            />
            <Button label={i18n.t('onb.demo')} tone="ghost" onPress={onDemo} />
          </>
        ) : null}
        {step === 'name' ? (
          <Button
            label={i18n.t('common.next')}
            size="lg"
            disabled={!canContinueName}
            onPress={() => {
              go(1);
            }}
          />
        ) : null}
        {step === 'about' || step === 'goals' ? (
          <>
            <Button
              label={i18n.t('common.next')}
              size="lg"
              onPress={() => {
                go(1);
              }}
            />
            <Button
              label={i18n.t('common.skip')}
              tone="ghost"
              onPress={() => {
                go(1);
              }}
            />
          </>
        ) : null}
        {step === 'perms' ? (
          <>
            <Button
              label={i18n.t('common.allow')}
              size="lg"
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void onRequestPermissions().finally(() => {
                  setBusy(false);
                  go(1);
                });
              }}
            />
            <Button
              label={i18n.t('common.later')}
              tone="ghost"
              onPress={() => {
                go(1);
              }}
            />
          </>
        ) : null}
        {step === 'done' ? (
          <>
            <Button
              label={i18n.t('onb.firstWalk')}
              size="lg"
              icon="paw"
              onPress={() => {
                finish(true);
              }}
            />
            <Button
              label={i18n.t('onb.toToday')}
              tone="ghost"
              onPress={() => {
                finish(false);
              }}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}
