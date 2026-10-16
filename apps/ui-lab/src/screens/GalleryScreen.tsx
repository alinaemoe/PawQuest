import {
  AppText,
  Button,
  Card,
  Chip,
  EventButton,
  Icon,
  useTheme,
  type EventKind,
  type IconName,
} from '@pawquest/rn-ui';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

const ICONS: readonly IconName[] = [
  'home',
  'pin',
  'target',
  'chart',
  'paw',
  'play',
  'pause',
  'stop',
  'plus',
  'check',
  'x',
  'tilde',
  'undo',
  'lock',
  'camera',
  'note',
  'drop',
  'search',
  'star',
  'heart',
  'map',
  'disc',
  'cookie',
  'scale',
  'cog',
];
const KINDS: readonly EventKind[] = ['dog', 'person', 'child', 'animal', 'ok', 'hard', 'ex'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{title}</AppText>
      {children}
    </View>
  );
}

/** All shared components on one screen, for quick visual checks of palettes and themes. */
export function GalleryScreen() {
  const { colors } = useTheme().theme;
  const [chip, setChip] = useState('Парк');

  return (
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={{ padding: 16, gap: 18 }}
    >
      <Section title="Текст">
        <AppText variant="title">Заголовок Unbounded</AppText>
        <AppText>Основной текст Onest: «Привет, Фрэнни»</AppText>
        <AppText variant="muted">Второстепенный текст и подписи</AppText>
        <AppText variant="mono">00:23:41 · 1,84 км</AppText>
        <AppText variant="numBig">12 прогулок</AppText>
      </Section>

      <Section title="Кнопки">
        <Button label="Начать прогулку" icon="paw" size="lg" onPress={() => undefined} />
        <Button label="Сохранить" onPress={() => undefined} />
        <Button label="Обновить" tone="ghost" icon="undo" onPress={() => undefined} />
        <Button label="Недоступно" disabled onPress={() => undefined} />
      </Section>

      <Section title="Чипы">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['Парк', 'Луг', 'Двор', 'Набережная'].map((label) => (
            <Chip
              key={label}
              label={label}
              selected={chip === label}
              onPress={() => {
                setChip(label);
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Малый" size="sm" />
          <Chip label="Выбранный" size="sm" selected />
        </View>
      </Section>

      <Section title="Карточки">
        <Card>
          <AppText variant="eyebrow">Мягкая</AppText>
          <AppText>Подзыв: в тихих местах 7 из 8, на оживлённых 2 из 6</AppText>
        </Card>
        <Card variant="flat">
          <AppText variant="eyebrow">С рамкой</AppText>
          <AppText>Напоминание: таблетка от паразитов</AppText>
        </Card>
        <Card variant="stripe">
          <AppText variant="eyebrow">С акцентом</AppText>
          <AppText>Карточка закономерности · предварительно</AppText>
        </Card>
      </Section>

      <Section title="Кнопки событий">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((kind) => (
            <View key={kind} style={{ width: '31%' }}>
              <EventButton
                kind={kind}
                label={kind}
                count={kind === 'dog' ? 3 : 0}
                onPress={() => undefined}
              />
            </View>
          ))}
        </View>
      </Section>

      <Section title="Иконки">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {ICONS.map((name) => (
            <Icon key={name} name={name} color={colors.accent} />
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}
