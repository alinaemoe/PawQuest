import { AppText, Chip, useI18n } from '@pawquest/rn-ui';
import { ScrollView, View } from 'react-native';

export interface WalkFilterBarProps {
  readonly folders: readonly { readonly id: string; readonly name: string }[];
  /** The folder whose filter is on now, or null. */
  readonly activeFolderId: string | null;
  /** The conditions in a line ("30 дн. · мокро"), empty when no filter is on. */
  readonly summary: string;
  readonly found: number | null;
  readonly onOpen: () => void;
  readonly onFolder: (id: string) => void;
  readonly onReset: () => void;
  readonly onDeleteFolder: (id: string) => void;
}

/** Over the list of walks: the filter button, the folders, and what is on now. */
export function WalkFilterBar(props: WalkFilterBarProps) {
  const i18n = useI18n();
  const active = props.summary !== '';
  return (
    <View style={{ gap: 8 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label={i18n.t('filter.open')}
          selected={active && props.activeFolderId === null}
          onPress={props.onOpen}
        />
        {props.folders.map((folder) => (
          <Chip
            key={folder.id}
            label={folder.name}
            selected={props.activeFolderId === folder.id}
            onPress={() => {
              props.onFolder(folder.id);
            }}
          />
        ))}
      </ScrollView>
      {active ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AppText variant="muted" style={{ flexShrink: 1 }}>
            {props.summary}
            {props.found === null ? '' : ` · ${i18n.t('filter.found', { n: props.found })}`}
          </AppText>
          <Chip size="sm" label={i18n.t('filter.reset')} onPress={props.onReset} />
          {props.activeFolderId === null ? null : (
            <Chip
              size="sm"
              label={i18n.t('filter.deleteFolder')}
              onPress={() => {
                if (props.activeFolderId !== null) {
                  props.onDeleteFolder(props.activeFolderId);
                }
              }}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}
