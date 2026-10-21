import { AppText, Chip, Screen, useTheme } from '@pawquest/rn-ui';
import {
  AchievementSheet,
  AchievementsScreen,
  GoalEditSheet,
  GoalsScreen,
  PawsSheet,
  SAMPLE_ACHIEVEMENTS,
  SAMPLE_BASIS,
  SAMPLE_GOALS,
  SAMPLE_GOAL_EDIT,
  SAMPLE_LADDER,
  SAMPLE_LEVEL,
  SAMPLE_PAW_HISTORY,
  SAMPLE_PAW_HOW,
  SAMPLE_PAW_WEEK,
  SAMPLE_STREAK,
  SAMPLE_SUGGESTION,
  TodayRewardsCard,
  UnlockCard,
  type AchievementTab,
  type GoalEditRow,
} from '@pawquest/screens';
import { useState } from 'react';
import { View } from 'react-native';

type Frame = 'hub' | 'empty' | 'catalog' | 'today';

const FRAMES: readonly { readonly id: Frame; readonly label: string }[] = [
  { id: 'hub', label: 'Хаб' },
  { id: 'empty', label: 'Без целей' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'today', label: 'Сегодня и «Новое»' },
];

/**
 * Design showcase of the rewards section (docs/25): the real components over invented data, so the
 * look and the logic can be judged before the data layer is built. Open with `?preview=rewards`.
 */
export function RewardsPreview() {
  const { colors } = useTheme().theme;
  const [frame, setFrame] = useState<Frame>('hub');
  const [tab, setTab] = useState<AchievementTab>('all');
  const [onlyEarned, setOnlyEarned] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paws, setPaws] = useState(false);
  const [editing, setEditing] = useState(false);
  const [goalRows, setGoalRows] = useState<readonly GoalEditRow[]>(SAMPLE_GOAL_EDIT);
  const [restToday, setRestToday] = useState(false);
  const [unlock, setUnlock] = useState(true);
  const [calm, setCalm] = useState(true);
  const [goals, setGoals] = useState<'set' | 'none'>('set');

  const unlockSample = SAMPLE_ACHIEVEMENTS.find((a) => a.id === 'routine');
  const opened = SAMPLE_ACHIEVEMENTS.find((a) => a.id === openId) ?? null;
  const streak = { ...SAMPLE_STREAK, canRest: !restToday, restToday };
  const noop = () => undefined;

  const hub = (hasGoals: boolean) => (
    <GoalsScreen
      streak={streak}
      level={SAMPLE_LEVEL}
      goals={hasGoals ? SAMPLE_GOALS : null}
      suggestion={SAMPLE_SUGGESTION}
      until="воскресенья"
      achievements={SAMPLE_ACHIEVEMENTS}
      showCalm={calm}
      onBack={noop}
      onSettings={noop}
      onRest={() => {
        setRestToday(true);
      }}
      onUndoRest={() => {
        setRestToday(false);
      }}
      onLevel={() => {
        setPaws(true);
      }}
      onEditGoals={() => {
        setEditing(true);
      }}
      onAcceptGoals={() => {
        setGoals('set');
        setFrame('hub');
      }}
      onSkipGoals={noop}
      onOpenAchievement={setOpenId}
      onAll={() => {
        setFrame('catalog');
      }}
      onHideCalm={() => {
        setCalm(false);
      }}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 430, flex: 1, backgroundColor: colors.bg }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            padding: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
            backgroundColor: colors.surface,
          }}
        >
          {FRAMES.map((f) => (
            <Chip
              key={f.id}
              size="sm"
              label={f.label}
              selected={frame === f.id}
              onPress={() => {
                setFrame(f.id);
                if (f.id === 'empty') {
                  setGoals('none');
                }
                if (f.id === 'hub') {
                  setGoals('set');
                }
              }}
            />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          {frame === 'hub' || frame === 'empty' ? hub(goals === 'set' && frame === 'hub') : null}
          {frame === 'catalog' ? (
            <AchievementsScreen
              achievements={SAMPLE_ACHIEVEMENTS}
              tab={tab}
              onlyEarned={onlyEarned}
              onTab={setTab}
              onToggleEarned={() => {
                setOnlyEarned((v) => !v);
              }}
              onOpen={setOpenId}
              onBack={() => {
                setFrame('hub');
              }}
            />
          ) : null}
          {frame === 'today' ? (
            <Screen>
              <AppText variant="numBig">Сегодня</AppText>
              <TodayRewardsCard
                goals={SAMPLE_GOALS}
                streakDays={SAMPLE_STREAK.days}
                paws={SAMPLE_LEVEL.total}
                canRest={!restToday}
                onRest={() => {
                  setRestToday(true);
                }}
                onOpen={() => {
                  setFrame('hub');
                }}
              />
              <AppText variant="eyebrow">После итога прогулки</AppText>
              {unlock && unlockSample !== undefined ? (
                <UnlockCard
                  achievement={unlockSample}
                  more={1}
                  onBasis={() => {
                    setOpenId('routine');
                  }}
                  onClose={() => {
                    setUnlock(false);
                  }}
                />
              ) : (
                <Chip
                  size="sm"
                  label="Показать карточку снова"
                  onPress={() => {
                    setUnlock(true);
                  }}
                />
              )}
            </Screen>
          ) : null}
        </View>
      </View>

      <AchievementSheet
        visible={opened !== null}
        achievement={opened}
        ladder={opened !== null && opened.steps === 3 ? SAMPLE_LADDER : []}
        basis={opened !== null && opened.tier > 0 ? SAMPLE_BASIS : []}
        why={
          opened?.mastery === true
            ? 'Нужно много попыток в сложных условиях, поэтому такое случается нечасто.'
            : null
        }
        wasHidden={opened?.hidden === true}
        onShowAll={noop}
        onClose={() => {
          setOpenId(null);
        }}
      />
      <PawsSheet
        visible={paws}
        level={SAMPLE_LEVEL}
        today={35}
        cap={100}
        week={SAMPLE_PAW_WEEK}
        history={SAMPLE_PAW_HISTORY}
        how={SAMPLE_PAW_HOW}
        onClose={() => {
          setPaws(false);
        }}
      />
      <GoalEditSheet
        visible={editing}
        rows={goalRows}
        onChange={(id, target) => {
          setGoalRows((rows) => rows.map((r) => (r.id === id ? { ...r, target } : r)));
        }}
        onDone={() => {
          setEditing(false);
        }}
      />
    </View>
  );
}
