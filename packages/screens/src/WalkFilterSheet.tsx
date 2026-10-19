import type { FilterFacets, FilterOptions, WalkFilter } from '@pawquest/data';
import {
  AppText,
  Button,
  Card,
  Chip,
  Sheet,
  TextField,
  useI18n,
  type IconName,
} from '@pawquest/rn-ui';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { valueLabel } from './insightsModel';
import {
  FILTER_GROUND,
  FILTER_LIGHT,
  FILTER_OUTCOMES,
  FILTER_PERIODS,
  FILTER_PLACE_KIND,
  activeTags,
  outcomeLabel,
  periodLabel,
  quickStarts,
  toggled,
  withDimension,
  type FilterDimension,
} from './walkFilterModel';

export interface WalkFilterSheetProps {
  readonly visible: boolean;
  readonly filter: WalkFilter;
  readonly options: FilterOptions;
  /** What the filter gives now and what each option would give. */
  readonly facets: FilterFacets;
  /** The time and the distance of the walks that match, already worded ("4 ч 20 мин · 9,8 км"). */
  readonly totalsLine: string;
  readonly typeLabel: (typeId: string) => string;
  readonly onChange: (filter: WalkFilter) => void;
  readonly onClose: () => void;
  readonly onReset: () => void;
  /** Saves the filter as a folder with this name. */
  readonly onSaveFolder: (name: string) => void;
}

function Group(props: {
  readonly title: string;
  readonly icon: IconName;
  readonly children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{props.title}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{props.children}</View>
    </View>
  );
}

/**
 * Filter the walks: a result strip that counts as you choose, tags to take conditions off, quick
 * starts, and groups of options that each say how many walks they would give.
 */
export function WalkFilterSheet(props: WalkFilterSheetProps) {
  const i18n = useI18n();
  const { filter, options, facets, onChange } = props;
  const [name, setName] = useState('');
  const tags = activeTags(filter, options, props.typeLabel, i18n);
  const dimension = (
    key: FilterDimension,
    values: readonly string[],
    title: string,
    icon: IconName,
    lead?: Readonly<Record<string, IconName>>,
  ): React.ReactNode => (
    <Group title={title} icon={icon}>
      {values.map((value) => (
        <Chip
          key={value}
          size="sm"
          lead={lead?.[value] ?? icon}
          label={valueLabel(i18n, key, value)}
          badge={facets.dims[key]?.[value] ?? 0}
          selected={(filter.dims[key] ?? []).includes(value)}
          onPress={() => {
            onChange(withDimension(filter, key, value));
          }}
        />
      ))}
    </Group>
  );
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title={i18n.t('filter.title')}>
      <Card variant="stripe">
        <AppText variant="numBig">{i18n.t('walks.count', { n: facets.total })}</AppText>
        {facets.total === 0 ? null : <AppText variant="muted">{props.totalsLine}</AppText>}
      </Card>

      {tags.length === 0 ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tags.map((tag) => (
            <Chip
              key={tag.key}
              size="sm"
              selected
              lead="x"
              label={tag.label}
              onPress={() => {
                onChange(tag.without);
              }}
            />
          ))}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('filter.quick')}</AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {quickStarts(i18n).map((quick) => (
            <Chip
              key={quick.key}
              size="sm"
              lead="star"
              label={quick.label}
              onPress={() => {
                onChange(quick.apply(filter));
              }}
            />
          ))}
        </ScrollView>
      </View>

      <Group title={i18n.t('filter.period')} icon="calendar">
        {FILTER_PERIODS.map((days) => (
          <Chip
            key={String(days)}
            size="sm"
            lead="calendar"
            label={periodLabel(days, i18n)}
            badge={facets.periods[days === null ? 'all' : String(days)] ?? 0}
            selected={filter.days === days}
            onPress={() => {
              onChange({ ...filter, days });
            }}
          />
        ))}
      </Group>

      {options.places.length === 0 ? null : (
        <Group title={i18n.t('filter.place')} icon="pin">
          {options.places.map((place) => (
            <Chip
              key={place.id}
              size="sm"
              lead="pin"
              label={place.name}
              badge={facets.places[place.id] ?? 0}
              selected={filter.placeIds.includes(place.id)}
              onPress={() => {
                onChange({ ...filter, placeIds: toggled(filter.placeIds, place.id) });
              }}
            />
          ))}
        </Group>
      )}

      {dimension('place_kind', FILTER_PLACE_KIND, i18n.t('filter.placeKind'), 'map')}
      {dimension('ground', FILTER_GROUND, i18n.t('filter.ground'), 'drop', {
        dry: 'sun',
        icy: 'triangle',
      })}
      {dimension('light', FILTER_LIGHT, i18n.t('filter.light'), 'sun', {
        twilight: 'clock',
        dark: 'moon',
      })}

      {options.eventTypes.length === 0 ? null : (
        <Group title={i18n.t('filter.events')} icon="paw">
          {options.eventTypes.map((type) => (
            <Chip
              key={type}
              size="sm"
              lead="paw"
              label={props.typeLabel(type)}
              badge={facets.eventTypes[type] ?? 0}
              selected={filter.eventTypes.includes(type)}
              onPress={() => {
                onChange({ ...filter, eventTypes: toggled(filter.eventTypes, type) });
              }}
            />
          ))}
        </Group>
      )}

      <Group title={i18n.t('filter.outcomes')} icon="star">
        {FILTER_OUTCOMES.map((outcome) => (
          <Chip
            key={outcome}
            size="sm"
            lead={outcome === 'success' ? 'star' : 'diamond'}
            label={outcomeLabel(outcome, i18n)}
            badge={facets.outcomes[outcome] ?? 0}
            selected={filter.outcomes.includes(outcome)}
            onPress={() => {
              onChange({ ...filter, outcomes: toggled(filter.outcomes, outcome) });
            }}
          />
        ))}
        <Chip
          size="sm"
          lead="target"
          label={i18n.t('filter.training')}
          badge={facets.training}
          selected={filter.training}
          onPress={() => {
            onChange({ ...filter, training: !filter.training });
          }}
        />
      </Group>

      <Button label={i18n.t('filter.show', { n: facets.total })} onPress={props.onClose} />
      <Button label={i18n.t('filter.reset')} tone="ghost" onPress={props.onReset} />

      <View style={{ gap: 8 }}>
        <TextField
          label={i18n.t('filter.folderName')}
          value={name}
          onChangeText={setName}
          placeholder={i18n.t('filter.folderPlaceholder')}
          maxLength={40}
        />
        <Button
          label={i18n.t('filter.saveFolder')}
          tone="ghost"
          icon="plus"
          disabled={name.trim() === ''}
          onPress={() => {
            props.onSaveFolder(name);
            setName('');
          }}
        />
      </View>
    </Sheet>
  );
}
