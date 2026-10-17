import type { Dog, PaletteKey } from '@pawquest/data';
import type { Locale, UnitSystem } from '@pawquest/i18n';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  ListRow,
  Screen,
  SwitchRow,
  Tag,
  useI18n,
  useTheme,
  type SchemeMode,
} from '@pawquest/rn-ui';
import { PALETTES } from '@pawquest/ui';
import { Pressable, View } from 'react-native';

import { ageText } from './model';

export interface DogScreenProps {
  readonly dog: Dog;
  readonly language: Locale;
  readonly units: UnitSystem;
  readonly palette: PaletteKey;
  readonly scheme: SchemeMode;
  readonly haptics: boolean;
  readonly autoFinish: boolean;
  readonly onLanguage: (language: Locale) => void;
  readonly onUnits: (units: UnitSystem) => void;
  readonly onPalette: (palette: PaletteKey) => void;
  readonly onScheme: (scheme: SchemeMode) => void;
  readonly onHaptics: (on: boolean) => void;
  readonly onAutoFinish: (on: boolean) => void;
  readonly trashCount: number;
  readonly incompleteCount: number;
  readonly onTrash: () => void;
  readonly onDiary: () => void;
  readonly onHealth: () => void;
  readonly onPlaces: () => void;
  readonly onMarks: () => void;
  readonly onAlbum: () => void;
  readonly onRoutes: () => void;
  readonly onRecap: () => void;
  readonly onEditProfile: () => void;
  readonly onDiagnostics: () => void;
  readonly onRemoveDemo: () => void;
}

const PALETTE_KEYS: readonly PaletteKey[] = ['forest', 'sea', 'berry', 'sun'];
const SCHEMES: readonly SchemeMode[] = ['system', 'light', 'dark'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{title}</AppText>
      {children}
    </View>
  );
}

/** The Dog tab: profile card and settings (spec 07). Changes apply live. */
export function DogScreen(props: DogScreenProps) {
  const i18n = useI18n();
  const { theme } = useTheme();
  const age = ageText(props.dog.approxAgeMonths, i18n.t);
  const details = [age, props.dog.breed].filter((x): x is string => x !== null && x !== '');

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.t('dog.edit')}
        onPress={props.onEditProfile}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <Avatar uri={props.dog.photoUri} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="numBig" numberOfLines={1}>
            {props.dog.name}
          </AppText>
          {details.length === 0 ? null : <AppText variant="muted">{details.join(' · ')}</AppText>}
        </View>
      </Pressable>

      {props.dog.isDemo ? (
        <Card variant="stripe">
          <AppText>{i18n.t('dog.demoNote')}</AppText>
          <View style={{ marginTop: 8 }}>
            <Button label={i18n.t('dog.removeDemo')} tone="ghost" onPress={props.onRemoveDemo} />
          </View>
        </Card>
      ) : null}

      <AppText variant="title" style={{ marginTop: 4 }}>
        {i18n.t('dog.settings')}
      </AppText>

      <Section title={i18n.t('dog.language')}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip
            label="Русский"
            selected={props.language === 'ru'}
            onPress={() => {
              props.onLanguage('ru');
            }}
          />
          <Chip
            label="English"
            selected={props.language === 'en'}
            onPress={() => {
              props.onLanguage('en');
            }}
          />
        </View>
      </Section>

      <Section title={i18n.t('dog.units')}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip
            label={i18n.t('units.metric')}
            selected={props.units === 'metric'}
            onPress={() => {
              props.onUnits('metric');
            }}
          />
          <Chip
            label={i18n.t('units.imperial')}
            selected={props.units === 'imperial'}
            onPress={() => {
              props.onUnits('imperial');
            }}
          />
        </View>
      </Section>

      <Section title={i18n.t('dog.palette')}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {PALETTE_KEYS.map((key) => {
            const selected = props.palette === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={i18n.t(`palette.${key}`)}
                accessibilityState={{ selected }}
                onPress={() => {
                  props.onPalette(key);
                }}
                style={{ alignItems: 'center', gap: 4 }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: PALETTES[key][theme.scheme],
                    borderWidth: 3,
                    borderColor: selected ? theme.colors.ink : 'transparent',
                  }}
                />
                <AppText variant="muted" style={{ fontSize: 11 }}>
                  {i18n.t(`palette.${key}`)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title={i18n.t('dog.theme')}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {SCHEMES.map((scheme) => (
            <Chip
              key={scheme}
              label={i18n.t(`theme.${scheme}`)}
              selected={props.scheme === scheme}
              onPress={() => {
                props.onScheme(scheme);
              }}
            />
          ))}
        </View>
      </Section>

      <SwitchRow
        label={i18n.t('dog.haptics')}
        value={props.haptics}
        onValueChange={props.onHaptics}
      />
      <SwitchRow
        label={i18n.t('dog.autoFinish')}
        value={props.autoFinish}
        onValueChange={props.onAutoFinish}
      />
      <AppText variant="muted">{i18n.t('dog.autoFinishHint')}</AppText>

      <Section title={i18n.t('dog.data')}>
        <ListRow
          icon="heart"
          title={i18n.t('dog.health')}
          subtitle={i18n.t('dog.healthHint')}
          onPress={props.onHealth}
        />
        <ListRow
          icon="pin"
          title={i18n.t('dog.places')}
          subtitle={i18n.t('dog.placesHint')}
          onPress={props.onPlaces}
        />
        <ListRow
          icon="map"
          title={i18n.t('dog.routes')}
          subtitle={i18n.t('dog.routesHint')}
          onPress={props.onRoutes}
        />
        <ListRow
          icon="camera"
          title={i18n.t('dog.album')}
          subtitle={i18n.t('dog.albumHint')}
          onPress={props.onAlbum}
        />
        <ListRow
          icon="chart"
          title={i18n.t('dog.recap')}
          subtitle={i18n.t('dog.recapHint')}
          onPress={props.onRecap}
        />
        <ListRow
          icon="paw"
          title={i18n.t('dog.marks')}
          subtitle={i18n.t('dog.marksHint')}
          onPress={props.onMarks}
        />
        <ListRow
          icon="note"
          title={i18n.t('dog.diary')}
          subtitle={i18n.t('dog.diaryHint')}
          right={
            props.incompleteCount > 0 ? (
              <Tag tone="warn" label={String(props.incompleteCount)} />
            ) : undefined
          }
          onPress={props.onDiary}
        />
        <ListRow
          icon="trash"
          title={i18n.t('dog.trash')}
          subtitle={i18n.t('dog.trashHint')}
          right={
            props.trashCount > 0 ? <Tag tone="plain" label={String(props.trashCount)} /> : undefined
          }
          divider={false}
          onPress={props.onTrash}
        />
      </Section>

      <Section title={i18n.t('dog.about')}>
        <ListRow
          icon="cog"
          title={i18n.t('dog.diagnostics')}
          subtitle={i18n.t('dog.diagnosticsHint')}
          right={<Tag tone="plain" label="v0.1" />}
          divider={false}
          onPress={props.onDiagnostics}
        />
      </Section>
    </Screen>
  );
}
