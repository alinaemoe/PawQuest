import type { MessageKey } from '@pawquest/i18n';
import {
  AppText,
  Card,
  Chip,
  Icon,
  Screen,
  Sheet,
  useI18n,
  useTheme,
  type IconName,
} from '@pawquest/rn-ui';
import { Pressable, ScrollView, View } from 'react-native';

import {
  ACHIEVEMENT_TABS,
  countEarned,
  filterAchievements,
  nearestAchievements,
  recentlyEarned,
  type AchievementModel,
  type AchievementTab,
  type GoalRowModel,
} from './rewardsModel';
import {
  AchievementRow,
  GoalList,
  GoalSuggestion,
  LevelCard,
  Medallion,
  StreakCard,
  TierMarks,
  useTierColor,
  type LevelModel,
  type StreakModel,
} from './RewardsViews';

const TAB_KEY: Readonly<Record<AchievementTab, MessageKey>> = {
  all: 'rewards.tab.all',
  walks: 'rewards.tab.walks',
  observations: 'rewards.tab.observations',
  training: 'rewards.tab.training',
  places: 'rewards.tab.places',
  data: 'rewards.tab.data',
  health: 'rewards.tab.health',
  frisbee: 'rewards.tab.frisbee',
  mastery: 'rewards.tab.mastery',
};

export interface GoalsScreenProps {
  readonly streak: StreakModel;
  readonly level: LevelModel;
  /** The goals of this week; null when none were set. */
  readonly goals: readonly GoalRowModel[] | null;
  /** Shown when `goals` is null. */
  readonly suggestion: readonly GoalRowModel[];
  readonly until: string;
  readonly achievements: readonly AchievementModel[];
  /** Yesterday had many triggers (A-08): a calm-day card, hideable. */
  readonly showCalm: boolean;
  readonly onBack: () => void;
  readonly onSettings: () => void;
  readonly onRest: () => void;
  readonly onUndoRest: () => void;
  readonly onLevel: () => void;
  readonly onEditGoals: () => void;
  readonly onAcceptGoals: () => void;
  readonly onSkipGoals: () => void;
  readonly onOpenAchievement: (id: string) => void;
  readonly onAll: () => void;
  readonly onHideCalm: () => void;
}

/** The hub of the section: streak, trail, goals of the week, what is close, what was earned. */
export function GoalsScreen(props: GoalsScreenProps) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  const soon = nearestAchievements(props.achievements, 3);
  const recent = recentlyEarned(props.achievements, 3);
  const counts = countEarned(props.achievements);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Chip size="sm" label={t('common.back')} onPress={props.onBack} />
        <Chip size="sm" lead="cog" label={t('rewards.settings')} onPress={props.onSettings} />
      </View>
      <AppText variant="numBig">{t('rewards.title')}</AppText>

      <StreakCard streak={props.streak} onRest={props.onRest} onUndoRest={props.onUndoRest} />
      <LevelCard level={props.level} onPress={props.onLevel} />

      {props.goals === null ? (
        <GoalSuggestion
          goals={props.suggestion}
          onAccept={props.onAcceptGoals}
          onEdit={props.onEditGoals}
          onSkip={props.onSkipGoals}
        />
      ) : (
        <GoalList goals={props.goals} until={props.until} onEdit={props.onEditGoals} />
      )}

      {soon.length === 0 ? null : (
        <Card variant="flat">
          <AppText variant="eyebrow">{t('rewards.soon')}</AppText>
          {soon.map((a) => (
            <AchievementRow
              key={a.id}
              achievement={a}
              compact
              onPress={() => {
                props.onOpenAchievement(a.id);
              }}
            />
          ))}
        </Card>
      )}

      {recent.length === 0 ? null : (
        <View style={{ gap: 8 }}>
          <AppText variant="eyebrow">{t('rewards.recent')}</AppText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {recent.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={a.title}
                onPress={() => {
                  props.onOpenAchievement(a.id);
                }}
                style={{ flex: 1, alignItems: 'center', gap: 6 }}
              >
                <Medallion icon={a.icon} tier={a.tier} size={54} />
                <AppText variant="small" numberOfLines={2} style={{ textAlign: 'center' }}>
                  {a.title}
                </AppText>
                <AppText variant="muted" style={{ fontSize: 11.5 }}>
                  {a.earnedOn}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('rewards.all')}
        onPress={props.onAll}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
          paddingHorizontal: 14,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
        }}
      >
        <Icon name="star" color={colors.accent} size={22} />
        <AppText weight={600} style={{ flex: 1 }}>
          {t('rewards.all')}
        </AppText>
        <AppText variant="mono" style={{ color: colors.muted }}>
          {t('rewards.allCount', { earned: counts.earned, total: counts.total })}
        </AppText>
        <Icon name="chevron" color={colors.muted} size={18} />
      </Pressable>

      {props.showCalm ? (
        <Card variant="stripe">
          <AppText>{t('rewards.calm.text')}</AppText>
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            <Chip size="sm" label={t('rewards.calm.hide')} onPress={props.onHideCalm} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

export interface AchievementsScreenProps {
  readonly achievements: readonly AchievementModel[];
  readonly tab: AchievementTab;
  readonly onlyEarned: boolean;
  readonly onTab: (tab: AchievementTab) => void;
  readonly onToggleEarned: () => void;
  readonly onOpen: (id: string) => void;
  readonly onBack: () => void;
}

/** The catalog: tabs by section, steps and progress; hidden ones are only counted. */
export function AchievementsScreen(props: AchievementsScreenProps) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  const rows = filterAchievements(props.achievements, props.tab, props.onlyEarned);
  const counts = countEarned(props.achievements);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={t('common.back')} onPress={props.onBack} />
      </View>
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <AppText variant="numBig">{t('rewards.all')}</AppText>
        <AppText variant="mono" style={{ color: colors.muted }}>
          {t('rewards.allCount', { earned: counts.earned, total: counts.total })}
        </AppText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {ACHIEVEMENT_TABS.map((tab) => (
          <Chip
            key={tab}
            size="sm"
            label={t(TAB_KEY[tab])}
            selected={props.tab === tab}
            onPress={() => {
              props.onTab(tab);
            }}
          />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row' }}>
        <Chip
          size="sm"
          lead="check"
          label={t('rewards.onlyEarned')}
          selected={props.onlyEarned}
          onPress={props.onToggleEarned}
        />
      </View>
      <Card variant="flat">
        {rows.map((a) => (
          <AchievementRow
            key={a.id}
            achievement={a}
            onPress={() => {
              props.onOpen(a.id);
            }}
          />
        ))}
      </Card>
      {counts.hiddenTotal === 0 ? null : (
        <AppText variant="muted" style={{ textAlign: 'center', fontSize: 12.5 }}>
          {t('rewards.hiddenLine', { n: counts.hiddenEarned })}
        </AppText>
      )}
    </Screen>
  );
}

export interface LadderStep {
  readonly tier: 1 | 2 | 3;
  /** Value needed for this step. */
  readonly at: number;
  /** Worded date, null if not earned yet. */
  readonly date: string | null;
}

export interface BasisRow {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

export interface AchievementSheetProps {
  readonly visible: boolean;
  readonly achievement: AchievementModel | null;
  readonly ladder: readonly LadderStep[];
  readonly basis: readonly BasisRow[];
  /** One sentence on why it is hard; only for Mastery. */
  readonly why: string | null;
  readonly wasHidden: boolean;
  readonly onShowAll: () => void;
  readonly onClose: () => void;
}

const TIER_KEY: Readonly<Record<1 | 2 | 3, MessageKey>> = {
  1: 'rewards.tier.1',
  2: 'rewards.tier.2',
  3: 'rewards.tier.3',
};

/** One achievement in detail: the steps, the date and the records it rests on. */
export function AchievementSheet(props: AchievementSheetProps) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  const tierColor = useTierColor();
  const a = props.achievement;
  return (
    <Sheet visible={props.visible && a !== null} onClose={props.onClose}>
      {a === null ? null : (
        <View style={{ gap: 14 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Medallion icon={a.icon} tier={a.tier} size={84} />
            <AppText variant="numBig" style={{ textAlign: 'center' }}>
              {a.title}
            </AppText>
            <TierMarks tier={a.tier} steps={a.steps} />
            <AppText variant="muted" style={{ textAlign: 'center' }}>
              {a.condition}
            </AppText>
            {props.wasHidden ? (
              <AppText variant="muted" style={{ fontSize: 12 }}>
                {t('rewards.wasHidden')}
              </AppText>
            ) : null}
          </View>

          {props.ladder.length < 2 ? null : (
            <View style={{ gap: 8 }}>
              {props.ladder.map((step) => (
                <View
                  key={step.tier}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: step.date === null ? 'transparent' : tierColor(step.tier),
                      borderWidth: 2,
                      borderColor: tierColor(step.tier),
                    }}
                  />
                  <AppText weight={600} style={{ width: 80 }}>
                    {t(TIER_KEY[step.tier])}
                  </AppText>
                  <AppText variant="muted" style={{ flex: 1 }}>
                    {t('rewards.ladder.at', { n: step.at })}
                  </AppText>
                  <AppText variant="muted">
                    {step.date ?? t('rewards.ladder.left', { n: Math.max(0, step.at - a.value) })}
                  </AppText>
                </View>
              ))}
            </View>
          )}

          {props.why === null ? null : (
            <Card variant="stripe">
              <AppText variant="small">{props.why}</AppText>
            </Card>
          )}

          {props.basis.length === 0 ? null : (
            <View>
              <AppText variant="eyebrow">{t('rewards.basis')}</AppText>
              {props.basis.map((row, i) => (
                <View
                  key={row.id}
                  style={{
                    paddingVertical: 9,
                    borderBottomWidth: i === props.basis.length - 1 ? 0 : 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  <AppText>{row.title}</AppText>
                  <AppText variant="muted" style={{ fontSize: 12.5 }}>
                    {row.subtitle}
                  </AppText>
                </View>
              ))}
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                <Chip size="sm" label={t('rewards.showAll')} onPress={props.onShowAll} />
              </View>
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

export interface PawEntryGroup {
  readonly day: string;
  readonly items: readonly {
    readonly id: string;
    readonly text: string;
    readonly delta: number;
    readonly revoked: boolean;
  }[];
}

export interface PawsSheetProps {
  readonly visible: boolean;
  readonly level: LevelModel;
  readonly today: number;
  readonly cap: number;
  /** Paws per day of the current week, Monday first. */
  readonly week: readonly { readonly label: string; readonly value: number }[];
  readonly history: readonly PawEntryGroup[];
  /** The table of what earns paws, already worded: "Прогулка сохранена" / 10. */
  readonly how: readonly { readonly text: string; readonly delta: string }[];
  readonly onClose: () => void;
}

/** Where the paws came from, day by day, and how they are earned. */
export function PawsSheet(props: PawsSheetProps) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  const top = Math.max(1, props.cap, ...props.week.map((d) => d.value));
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title={t('rewards.pawsOnly')}>
      <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 14 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <View>
            <AppText variant="eyebrow">{t('rewards.paws.total')}</AppText>
            <AppText variant="numBig">{props.level.total}</AppText>
          </View>
          <AppText weight={600}>{props.level.name}</AppText>
        </View>

        <Card variant="soft">
          <AppText weight={600}>
            {t('rewards.paws.today', { n: props.today, cap: props.cap })}
          </AppText>
          <AppText variant="muted" style={{ fontSize: 12.5 }}>
            {t('rewards.paws.capNote')}
          </AppText>
        </Card>

        <View style={{ gap: 6 }}>
          <AppText variant="eyebrow">{t('rewards.paws.week')}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 70, gap: 6 }}>
            {props.week.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: '100%',
                    height: Math.max(3, Math.round((d.value / top) * 48)),
                    borderRadius: 4,
                    backgroundColor: d.value === 0 ? colors.line : colors.accent,
                  }}
                />
                <AppText variant="small" style={{ color: colors.muted }}>
                  {d.label}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <AppText variant="eyebrow">{t('rewards.paws.history')}</AppText>
          {props.history.map((group) => (
            <View key={group.day}>
              <AppText weight={600} style={{ marginTop: 4 }}>
                {group.day}
              </AppText>
              {group.items.map((item) => (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 5,
                  }}
                >
                  <AppText variant="muted" style={{ flex: 1, opacity: item.revoked ? 0.6 : 1 }}>
                    {item.revoked ? `${t('rewards.paws.revoked')}: ${item.text}` : item.text}
                  </AppText>
                  <AppText variant="mono" style={{ opacity: item.revoked ? 0.6 : 1 }}>
                    {item.delta > 0 ? `+${String(item.delta)}` : String(item.delta)}
                  </AppText>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={{ gap: 4 }}>
          <AppText variant="eyebrow">{t('rewards.paws.how')}</AppText>
          {props.how.map((row) => (
            <View
              key={row.text}
              style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}
            >
              <AppText variant="muted" style={{ flex: 1 }}>
                {row.text}
              </AppText>
              <AppText variant="mono">{row.delta}</AppText>
            </View>
          ))}
          <AppText variant="small" style={{ color: colors.accent, marginTop: 4 }}>
            {t('rewards.paws.howNo')}
          </AppText>
        </View>
      </ScrollView>
    </Sheet>
  );
}

export interface GoalEditRow {
  readonly id: string;
  readonly icon: IconName;
  readonly title: string;
  /** "3 прогулки с итогом в неделю" */
  readonly usual: string;
  /** 0 = off. */
  readonly target: number;
}

export interface GoalEditSheetProps {
  readonly visible: boolean;
  readonly rows: readonly GoalEditRow[];
  readonly onChange: (id: string, target: number) => void;
  readonly onDone: () => void;
}

/** The goals of the week: a stepper per kind; zero switches the row off, three kinds at most. */
export function GoalEditSheet(props: GoalEditSheetProps) {
  const { t } = useI18n();
  const { colors } = useTheme().theme;
  const active = props.rows.filter((r) => r.target > 0).length;
  return (
    <Sheet visible={props.visible} onClose={props.onDone} title={t('rewards.goalEdit.title')}>
      <View style={{ gap: 4 }}>
        <AppText variant="muted">{t('rewards.goalEdit.hint')}</AppText>
        {props.rows.map((row) => {
          const canAdd = row.target > 0 || active < 3;
          return (
            <View
              key={row.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <Icon
                name={row.icon}
                color={row.target > 0 ? colors.accent : colors.muted}
                size={22}
              />
              <View style={{ flex: 1 }}>
                <AppText weight={row.target > 0 ? 600 : 400}>{row.title}</AppText>
                <AppText variant="muted" style={{ fontSize: 12 }}>
                  {t('rewards.goalEdit.usual', { text: row.usual })}
                </AppText>
              </View>
              <Stepper
                value={row.target}
                canAdd={canAdd}
                onMinus={() => {
                  props.onChange(row.id, Math.max(0, row.target - 1));
                }}
                onPlus={() => {
                  props.onChange(row.id, row.target + 1);
                }}
              />
            </View>
          );
        })}
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Chip selected lead="check" label={t('rewards.goalEdit.done')} onPress={props.onDone} />
        </View>
      </View>
    </Sheet>
  );
}

function Stepper(props: {
  readonly value: number;
  readonly canAdd: boolean;
  readonly onMinus: () => void;
  readonly onPlus: () => void;
}) {
  const { colors } = useTheme().theme;
  const button = (icon: 'minus' | 'plus', on: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon}
      disabled={!on}
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface2,
        opacity: on ? 1 : 0.35,
      }}
    >
      <Icon name={icon} color={colors.ink} size={18} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {button('minus', props.value > 0, props.onMinus)}
      <AppText variant="mono" style={{ minWidth: 22, textAlign: 'center' }}>
        {props.value}
      </AppText>
      {button('plus', props.canAdd, props.onPlus)}
    </View>
  );
}
