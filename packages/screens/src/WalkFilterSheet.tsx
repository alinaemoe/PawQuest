import type { FilterOptions, WalkFilter } from '@pawquest/data';
import { AppText, Button, Chip, Sheet, TextField, useI18n } from '@pawquest/rn-ui';
import { useState } from 'react';
import { View } from 'react-native';

import { valueLabel } from './insightsModel';
import {
  FILTER_GROUND,
  FILTER_LIGHT,
  FILTER_OUTCOMES,
  FILTER_PERIODS,
  FILTER_PLACE_KIND,
  outcomeLabel,
  periodLabel,
  toggled,
  withDimension,
  type FilterDimension,
} from './walkFilterModel';

export interface WalkFilterSheetProps {
  readonly visible: boolean;
  readonly filter: WalkFilter;
  readonly options: FilterOptions;
  /** How many walks the filter gives now. */
  readonly count: number;
  readonly typeLabel: (typeId: string) => string;
  readonly onChange: (filter: WalkFilter) => void;
  readonly onClose: () => void;
  readonly onReset: () => void;
  /** Saves the filter as a folder with this name. */
  readonly onSaveFolder: (name: string) => void;
}

function Group(props: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="eyebrow">{props.title}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{props.children}</View>
    </View>
  );
}

/** Filter the walks by period, place, weather, light, events and what happened; save it as a folder. */
export function WalkFilterSheet(props: WalkFilterSheetProps) {
  const i18n = useI18n();
  const { filter, options, onChange } = props;
  const [name, setName] = useState('');
  const dimension = (
    key: FilterDimension,
    values: readonly string[],
    title: string,
  ): React.ReactNode => (
    <Group title={title}>
      {values.map((value) => (
        <Chip
          key={value}
          size="sm"
          label={valueLabel(i18n, key, value)}
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
      <Group title={i18n.t('filter.period')}>
        {FILTER_PERIODS.map((days) => (
          <Chip
            key={String(days)}
            size="sm"
            label={periodLabel(days, i18n)}
            selected={filter.days === days}
            onPress={() => {
              onChange({ ...filter, days });
            }}
          />
        ))}
      </Group>

      {options.places.length === 0 ? null : (
        <Group title={i18n.t('filter.place')}>
          {options.places.map((place) => (
            <Chip
              key={place.id}
              size="sm"
              label={place.name}
              selected={filter.placeIds.includes(place.id)}
              onPress={() => {
                onChange({ ...filter, placeIds: toggled(filter.placeIds, place.id) });
              }}
            />
          ))}
        </Group>
      )}

      {dimension('place_kind', FILTER_PLACE_KIND, i18n.t('filter.placeKind'))}
      {dimension('ground', FILTER_GROUND, i18n.t('filter.ground'))}
      {dimension('light', FILTER_LIGHT, i18n.t('filter.light'))}

      {options.eventTypes.length === 0 ? null : (
        <Group title={i18n.t('filter.events')}>
          {options.eventTypes.map((type) => (
            <Chip
              key={type}
              size="sm"
              label={props.typeLabel(type)}
              selected={filter.eventTypes.includes(type)}
              onPress={() => {
                onChange({ ...filter, eventTypes: toggled(filter.eventTypes, type) });
              }}
            />
          ))}
        </Group>
      )}

      <Group title={i18n.t('filter.outcomes')}>
        {FILTER_OUTCOMES.map((outcome) => (
          <Chip
            key={outcome}
            size="sm"
            label={outcomeLabel(outcome, i18n)}
            selected={filter.outcomes.includes(outcome)}
            onPress={() => {
              onChange({ ...filter, outcomes: toggled(filter.outcomes, outcome) });
            }}
          />
        ))}
        <Chip
          size="sm"
          label={i18n.t('filter.training')}
          selected={filter.training}
          onPress={() => {
            onChange({ ...filter, training: !filter.training });
          }}
        />
      </Group>

      <Button label={i18n.t('filter.show', { n: props.count })} onPress={props.onClose} />
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
