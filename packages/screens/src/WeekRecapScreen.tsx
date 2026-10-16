import { AppText, Card, Chip, Icon, Screen, useI18n, useTheme } from '@pawquest/rn-ui';
import { Image, Pressable, View } from 'react-native';

import type { PhotoThumb } from './PhotoViews';

export interface WeekRecapModel {
  /** "12 – 18 окт" */
  readonly range: string;
  readonly walksLabel: string;
  readonly distance: string;
  readonly duration: string;
  /** The comparison with the week before, already worded. */
  readonly versus: string;
  readonly successes: number;
  readonly hard: number;
  readonly calm: string | null;
  readonly longest: string | null;
  readonly photo: PhotoThumb | null;
  readonly photoCount: number;
}

export interface WeekRecapScreenProps {
  /** Null when the week had no walks. */
  readonly recap: WeekRecapModel | null;
  readonly range: string;
  readonly isCurrent: boolean;
  readonly onBack: () => void;
  readonly onEarlier: () => void;
  readonly onLater: () => void;
  readonly onOpenPhoto: () => void;
}

function Stat(props: { readonly label: string; readonly value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="eyebrow">{props.label}</AppText>
      <AppText variant="numBig" style={{ fontSize: 28 }} numberOfLines={1} adjustsFontSizeToFit>
        {props.value}
      </AppText>
    </View>
  );
}

function Fact(props: {
  readonly icon: 'star' | 'heart' | 'pin';
  readonly label: string;
  readonly text: string;
}) {
  const { colors } = useTheme().theme;
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={props.icon} size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="eyebrow">{props.label}</AppText>
        <AppText>{props.text}</AppText>
      </View>
    </View>
  );
}

/** Dog -> Week in review: one card with the walks, kilometers, the calmest stretch and a photo. */
export function WeekRecapScreen(props: WeekRecapScreenProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const { recap } = props;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={props.onBack} />
      </View>
      <AppText variant="numBig">{i18n.t('recap.title')}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Chip size="sm" label={`‹ ${i18n.t('recap.prev')}`} onPress={props.onEarlier} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          {props.isCurrent ? <AppText variant="eyebrow">{i18n.t('recap.thisWeek')}</AppText> : null}
          <AppText weight={600} numberOfLines={1} adjustsFontSizeToFit>
            {props.range}
          </AppText>
        </View>
        <Chip
          size="sm"
          label={`${i18n.t('recap.next')} ›`}
          onPress={props.isCurrent ? () => undefined : props.onLater}
        />
      </View>

      {recap === null ? (
        <Card variant="soft">
          <AppText weight={600}>{i18n.t('recap.emptyTitle')}</AppText>
          <AppText variant="muted">{i18n.t('recap.emptyText')}</AppText>
        </Card>
      ) : (
        <Card variant="soft">
          {recap.photo === null ? null : (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={i18n.t('recap.photos')}
              onPress={props.onOpenPhoto}
            >
              <Image
                source={{ uri: recap.photo.uri }}
                style={{ width: '100%', height: 200, borderRadius: 16, backgroundColor: '#0002' }}
                resizeMode="cover"
              />
              {recap.photoCount > 1 ? (
                <View
                  style={{
                    position: 'absolute',
                    right: 10,
                    bottom: 10,
                    backgroundColor: '#000a',
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <AppText style={{ color: '#fff' }}>
                    {i18n.t('album.count', { n: recap.photoCount })}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          )}
          <AppText variant="numBig" style={{ color: colors.accent }}>
            {recap.walksLabel}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Stat label={i18n.t('recap.distance')} value={recap.distance} />
            <Stat label={i18n.t('recap.time')} value={recap.duration} />
          </View>
          <AppText variant="muted">{recap.versus}</AppText>

          <View style={{ gap: 14, marginTop: 8 }}>
            {recap.calm === null ? null : (
              <Fact icon="heart" label={i18n.t('recap.calm')} text={recap.calm} />
            )}
            {recap.longest === null ? null : (
              <Fact icon="pin" label={i18n.t('recap.longest')} text={recap.longest} />
            )}
            {recap.successes > 0 ? (
              <Fact icon="star" label={i18n.t('recap.successes')} text={String(recap.successes)} />
            ) : null}
          </View>
          {recap.hard > 0 ? (
            <AppText variant="muted">
              {i18n.t('recap.hard')}: {recap.hard}
            </AppText>
          ) : null}
        </Card>
      )}
    </Screen>
  );
}
