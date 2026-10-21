import type { MessageKey } from '@pawquest/i18n';
import { AppText, Card, Chip, Icon, Ring, Tag, useI18n, useTheme } from '@pawquest/rn-ui';
import { mix } from '@pawquest/ui';
import type { IconName } from '@pawquest/rn-ui';
import { Pressable, View } from 'react-native';

import {
  achievementFraction,
  goalDone,
  goalFraction,
  goalRings,
  tierMarks,
  trailFill,
  type AchievementModel,
  type DayState,
  type GoalRowModel,
  type Tier,
  type WeekDayModel,
} from './rewardsModel';

/** Bronze, silver and gold are fixed metal colors, the same in every palette. */
const TIER_METAL: Readonly<Record<1 | 2 | 3, string>> = {
  1: '#b9784a',
  2: '#9aa7b0',
  3: '#d6a82a',
};

export function useTierColor(): (tier: Tier) => string {
  const { colors } = useTheme().theme;
  return (tier) => (tier === 0 ? colors.line : TIER_METAL[tier]);
}

/** A round badge for an achievement: the icon of its section inside a ring of the step's metal. */
export function Medallion(props: {
  readonly icon: IconName;
  readonly tier: Tier;
  readonly size?: number;
}) {
  const { colors } = useTheme().theme;
  const tierColor = useTierColor();
  const size = props.size ?? 44;
  const earned = props.tier > 0;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: earned ? 3 : 1.5,
        borderStyle: earned ? 'solid' : 'dashed',
        borderColor: earned ? tierColor(props.tier) : colors.muted,
        backgroundColor: earned
          ? mix(colors.surface, tierColor(props.tier), 0.16)
          : colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: earned ? 1 : 0.7,
      }}
    >
      <Icon name={props.icon} color={earned ? colors.ink : colors.muted} size={size * 0.46} />
    </View>
  );
}

/** Steps as small diamonds: filled for the earned ones. Never the only sign of the step. */
export function TierMarks(props: { readonly tier: Tier; readonly steps: 1 | 3 }) {
  const { colors } = useTheme().theme;
  const tierColor = useTierColor();
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
      {tierMarks(props.tier, props.steps).map((on, i) => (
        <View
          key={i}
          style={{
            width: 9,
            height: 9,
            borderRadius: 2,
            transform: [{ rotate: '45deg' }],
            backgroundColor: on ? tierColor(props.tier) : 'transparent',
            borderWidth: 1.5,
            borderColor: on ? tierColor(props.tier) : colors.muted,
          }}
        />
      ))}
    </View>
  );
}

function Bar(props: { readonly fraction: number; readonly color?: string }) {
  const { colors } = useTheme().theme;
  const done = Math.min(1, Math.max(0, props.fraction));
  return (
    <View
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.line,
        overflow: 'hidden',
        flexDirection: 'row',
      }}
    >
      <View style={{ flex: done, backgroundColor: props.color ?? colors.accent }} />
      <View style={{ flex: 1 - done }} />
    </View>
  );
}

const DAY_KEY: Readonly<Record<DayState, MessageKey>> = {
  record: 'rewards.day.record',
  rest: 'rewards.day.rest',
  pause: 'rewards.day.pause',
  today: 'rewards.day.today',
  future: 'rewards.day.future',
  gap: 'rewards.day.gap',
};

function DayDot(props: { readonly day: WeekDayModel }) {
  const { colors } = useTheme().theme;
  const { t } = useI18n();
  const { state } = props.day;
  const size = 38;
  const base = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  let inner: React.ReactNode;
  let style: object = {};
  if (state === 'record') {
    style = { backgroundColor: colors.accent };
    inner = <Icon name="paw" color={colors.accentInk} size={19} />;
  } else if (state === 'rest') {
    style = { borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.accentSoft };
    inner = <Icon name="moon" color={colors.accent} size={18} />;
  } else if (state === 'pause') {
    style = { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.accent };
    inner = <Icon name="paw" color={colors.accent} size={18} />;
  } else if (state === 'today') {
    style = { borderWidth: 3, borderColor: colors.accent };
    inner = (
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
    );
  } else {
    inner = (
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: state === 'gap' ? colors.muted : colors.line,
          opacity: state === 'gap' ? 0.5 : 1,
        }}
      />
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={`${props.day.label}: ${t(DAY_KEY[state])}`}
      style={{ alignItems: 'center', gap: 4, flex: 1 }}
    >
      <View style={[base, style]}>{inner}</View>
      <AppText variant="small" style={{ color: state === 'today' ? colors.accent : colors.muted }}>
        {props.day.label}
      </AppText>
    </View>
  );
}

export interface StreakModel {
  readonly days: number;
  readonly best: number;
  readonly week: readonly WeekDayModel[];
  /** "Среда: день отдыха. Пятница закрыта лапой-паузой, осталась 1 из 2." */
  readonly note: string;
  /** No record yet today: the rest button is shown. */
  readonly canRest: boolean;
  /** Today is already marked as a rest day. */
  readonly restToday: boolean;
}

/** The streak of days with a record and the strip of the current week (docs/25 §4.1). */
export function StreakCard(props: {
  readonly streak: StreakModel;
  readonly onRest: () => void;
  readonly onUndoRest: () => void;
}) {
  const { t } = useI18n();
  const { streak } = props;
  return (
    <Card variant="flat">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="eyebrow">{t('rewards.streak.title')}</AppText>
          <AppText variant="numBig">
            {streak.days === 0 ? '0' : t('rewards.streak.days', { n: streak.days })}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="eyebrow">{t('rewards.streak.best')}</AppText>
          <AppText variant="numBig" style={{ fontSize: 20 }}>
            {streak.best}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        {streak.week.map((day, i) => (
          <DayDot key={i} day={day} />
        ))}
      </View>
      <AppText variant="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
        {streak.days === 0 && streak.canRest ? t('rewards.streak.empty') : streak.note}
      </AppText>
      {streak.restToday ? (
        <View style={{ marginTop: 8, flexDirection: 'row' }}>
          <Chip
            lead="moon"
            label={t('rewards.streak.restDone')}
            selected
            onPress={props.onUndoRest}
          />
        </View>
      ) : streak.canRest ? (
        <View style={{ marginTop: 8, flexDirection: 'row' }}>
          <Chip lead="moon" label={t('rewards.streak.rest')} onPress={props.onRest} />
        </View>
      ) : null}
    </Card>
  );
}

export interface LevelModel {
  /** Already translated: "Следопыт". */
  readonly name: string;
  readonly total: number;
  /** Progress to the next level in [0, 1]. */
  readonly progress: number;
  /** Name of the next level, null at the top. */
  readonly nextName: string | null;
  readonly toNext: number | null;
}

/** The trail: ten paw prints that fill as the paws add up. No percent, no loading bar. */
export function LevelCard(props: { readonly level: LevelModel; readonly onPress: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  const { level } = props;
  const fill = trailFill(level.progress);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${level.name}. ${t('rewards.paws', { n: level.total })}`}
      onPress={props.onPress}
    >
      <Card variant="soft">
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View>
            <AppText variant="eyebrow">{t('rewards.pawsOnly')}</AppText>
            <AppText variant="numBig" style={{ fontSize: 22 }}>
              {level.name}
            </AppText>
          </View>
          <AppText variant="numBig" style={{ color: colors.accent }}>
            {level.total}
          </AppText>
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginVertical: 14,
            paddingHorizontal: 2,
          }}
        >
          {fill.map((part, i) => (
            <View
              key={i}
              style={{
                opacity: 0.2 + 0.8 * part,
                transform: [
                  { translateY: i % 2 === 0 ? -5 : 5 },
                  { rotate: i % 2 === 0 ? '-14deg' : '14deg' },
                ],
              }}
            >
              <Icon name="paw" color={part > 0 ? colors.accent : colors.muted} size={22} />
            </View>
          ))}
        </View>
        <AppText variant="muted" style={{ fontSize: 12.5 }}>
          {level.nextName === null || level.toNext === null
            ? t('rewards.level.top')
            : t('rewards.level.toNext', { name: level.nextName, n: level.toNext })}
        </AppText>
      </Card>
    </Pressable>
  );
}

/** The weekly goals as rows with a thin progress bar; a finished row shows a quiet "Done". */
export function GoalList(props: {
  readonly goals: readonly GoalRowModel[];
  readonly until: string;
  readonly onEdit: () => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  return (
    <Card variant="flat">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="eyebrow">
          {t('rewards.goals.title')} · {t('rewards.goals.until', { day: props.until })}
        </AppText>
        <Chip size="sm" label={t('rewards.goals.edit')} onPress={props.onEdit} />
      </View>
      {props.goals.map((goal) => {
        const done = goalDone(goal);
        return (
          <View
            key={goal.id}
            accessible
            accessibilityLabel={`${goal.title}: ${t('rewards.goals.of', { value: goal.value, target: goal.target })}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: done ? colors.accent : colors.accentSoft,
              }}
            >
              <Icon
                name={done ? 'check' : goal.icon}
                color={done ? colors.accentInk : colors.accent}
                size={18}
              />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText>{goal.title}</AppText>
                <AppText variant="mono" style={{ color: colors.muted }}>
                  {done
                    ? t('rewards.goals.done')
                    : t('rewards.goals.of', { value: goal.value, target: goal.target })}
                </AppText>
              </View>
              <Bar fraction={goalFraction(goal)} />
            </View>
          </View>
        );
      })}
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t('rewards.goals.suggested')}
      </AppText>
    </Card>
  );
}

/** A week without goals: the suggestion, to accept or to skip without any reproach. */
export function GoalSuggestion(props: {
  readonly goals: readonly GoalRowModel[];
  readonly onAccept: () => void;
  readonly onEdit: () => void;
  readonly onSkip: () => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  return (
    <Card variant="stripe">
      <AppText weight={600}>{t('rewards.goals.suggestTitle')}</AppText>
      <AppText variant="muted">{t('rewards.goals.suggestText')}</AppText>
      <View style={{ gap: 6, marginVertical: 8 }}>
        {props.goals.map((goal) => (
          <View key={goal.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name={goal.icon} color={colors.accent} size={18} />
            <AppText style={{ flex: 1 }}>{goal.title}</AppText>
            <AppText variant="mono">{goal.target}</AppText>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip selected lead="check" label={t('rewards.goals.accept')} onPress={props.onAccept} />
        <Chip label={t('rewards.goals.edit')} onPress={props.onEdit} />
        <Chip label={t('rewards.goals.skip')} onPress={props.onSkip} />
      </View>
    </Card>
  );
}

/** One achievement: medallion, name, condition, steps, progress to the next step. */
export function AchievementRow(props: {
  readonly achievement: AchievementModel;
  readonly compact?: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  const a = props.achievement;
  const finished = a.nextAt === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.title}. ${a.condition}`}
      onPress={props.onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 10,
        alignItems: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Medallion icon={a.icon} tier={a.tier} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppText weight={600} numberOfLines={1} style={{ flexShrink: 1 }}>
            {a.title}
          </AppText>
          {a.isNew ? <Tag label={t('rewards.new')} /> : null}
          {a.mastery ? <Tag tone="plain" label={t('rewards.mastery')} /> : null}
          <View style={{ flex: 1 }} />
          <TierMarks tier={a.tier} steps={a.steps} />
        </View>
        {props.compact === true ? null : (
          <AppText variant="muted" style={{ fontSize: 12.5 }}>
            {a.condition}
          </AppText>
        )}
        {finished ? (
          a.earnedOn === null ? null : (
            <AppText variant="muted" style={{ fontSize: 12 }}>
              {t('rewards.gotOn', { date: a.earnedOn })}
            </AppText>
          )
        ) : (
          <View style={{ gap: 3 }}>
            <Bar fraction={achievementFraction(a)} />
            <AppText variant="mono" style={{ color: colors.muted, fontSize: 11.5 }}>
              {a.value} / {a.nextAt}
            </AppText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** The card after saving a walk summary: what is new, calm and short-lived. */
export function UnlockCard(props: {
  readonly achievement: AchievementModel;
  readonly more: number;
  readonly onBasis: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const a = props.achievement;
  return (
    <Card variant="stripe">
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Medallion icon={a.icon} tier={a.tier} size={52} />
        <View style={{ flex: 1 }}>
          <AppText weight={600}>
            {t('rewards.unlock.title', { name: a.title })}
            {props.more > 0 ? ` ${t('rewards.unlock.more', { n: props.more })}` : ''}
          </AppText>
          <AppText variant="muted" style={{ fontSize: 12.5 }}>
            {a.condition}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Chip size="sm" label={t('rewards.unlock.basis')} onPress={props.onBasis} />
        <Chip size="sm" label={t('rewards.unlock.close')} onPress={props.onClose} />
      </View>
    </Card>
  );
}

/** The block on Today: rings of the goals, the streak and the paws, one tap to the hub. */
export function TodayRewardsCard(props: {
  readonly goals: readonly GoalRowModel[];
  readonly streakDays: number;
  readonly paws: number;
  readonly canRest: boolean;
  readonly onRest: () => void;
  readonly onOpen: () => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  return (
    <Card variant="flat">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('rewards.title')}
        onPress={props.onOpen}
      >
        <AppText variant="eyebrow">{t('rewards.today.title')}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {goalRings(props.goals).map((goal) => (
              <Ring key={goal.id} value={goal.value} total={goal.target} label={goal.title} />
            ))}
          </View>
          <View style={{ gap: 10, paddingLeft: 12, alignItems: 'flex-end' }}>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="eyebrow">{t('rewards.today.streak')}</AppText>
              <AppText weight={600}>{t('rewards.streak.days', { n: props.streakDays })}</AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="paw" color={colors.accent} size={16} />
              <AppText weight={600}>{props.paws}</AppText>
            </View>
          </View>
        </View>
      </Pressable>
      {props.canRest ? (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Chip size="sm" lead="moon" label={t('rewards.streak.rest')} onPress={props.onRest} />
        </View>
      ) : null}
    </Card>
  );
}
