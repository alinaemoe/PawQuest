import type { Dog, DogSize, Sex } from '@pawquest/data';
import { AppText, Button, Chip, Sheet, TextField, useI18n } from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export interface DogEdit {
  readonly name: string;
  readonly approxAgeMonths: number | null;
  readonly size: DogSize | null;
  readonly sex: Sex | null;
  readonly breed: string | null;
}

export interface DogEditSheetProps {
  readonly visible: boolean;
  readonly dog: Dog;
  readonly onClose: () => void;
  readonly onSave: (edit: DogEdit) => void;
}

const SIZES: readonly DogSize[] = ['small', 'medium', 'large', 'giant'];
const SEXES: readonly Sex[] = ['female', 'male', 'unknown'];

function whole(text: string): number | null {
  return /^d{1,2}$/.test(text.trim()) ? Number(text.trim()) : null;
}

/** Fix the name and details given at onboarding; the name is the only required field. */
export function DogEditSheet({ visible, dog, onClose, onSave }: DogEditSheetProps) {
  const i18n = useI18n();
  const months = dog.approxAgeMonths;
  const [name, setName] = useState(dog.name);
  const [years, setYears] = useState(months === null ? '' : String(Math.floor(months / 12)));
  const [rest, setRest] = useState(months === null ? '' : String(months % 12));
  const [size, setSize] = useState<DogSize | null>(dog.size);
  const [sex, setSex] = useState<Sex | null>(dog.sex);
  const [breed, setBreed] = useState(dog.breed ?? '');
  useEffect(() => {
    if (visible) {
      setName(dog.name);
      setYears(dog.approxAgeMonths === null ? '' : String(Math.floor(dog.approxAgeMonths / 12)));
      setRest(dog.approxAgeMonths === null ? '' : String(dog.approxAgeMonths % 12));
      setSize(dog.size);
      setSex(dog.sex);
      setBreed(dog.breed ?? '');
    }
    // refill the form only when the sheet opens
  }, [visible]);

  const y = whole(years);
  const m = whole(rest);
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('dog.editTitle')}>
      <TextField label={i18n.t('onb.nameLabel')} value={name} onChangeText={setName} />
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
            value={rest}
            onChangeText={setRest}
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
      <Button
        label={i18n.t('common.save')}
        disabled={name.trim() === ''}
        onPress={() => {
          onSave({
            name: name.trim(),
            approxAgeMonths: y === null && m === null ? null : (y ?? 0) * 12 + (m ?? 0),
            size,
            sex,
            breed: breed.trim() === '' ? null : breed.trim(),
          });
        }}
      />
    </Sheet>
  );
}
