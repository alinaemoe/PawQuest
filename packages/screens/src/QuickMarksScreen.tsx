import type { MessageKey } from '@pawquest/i18n';
import {
  AppText,
  Button,
  Card,
  Chip,
  ListRow,
  MarkShape,
  Screen,
  Sheet,
  TextField,
  useI18n,
  useTheme,
  type EventKind,
} from '@pawquest/rn-ui';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { PANEL_LIMIT, panelIsFull, panelRows } from './quickMarksModel';

export interface MarkRow {
  readonly id: string;
  readonly label: string;
  readonly look: EventKind;
  /** The owner's own mark: it can be removed for good. */
  readonly custom: boolean;
}

export const LOOKS: readonly EventKind[] = ['dog', 'person', 'animal', 'child', 'ok', 'hard', 'ex'];

export interface QuickMarksScreenProps {
  /** The marks on the panel, in order. */
  readonly panel: readonly MarkRow[];
  /** Marks that exist but are not on the panel. */
  readonly catalog: readonly MarkRow[];
  readonly onBack: () => void;
  readonly onMove: (id: string, direction: -1 | 1) => void;
  readonly onRemove: (id: string) => void;
  readonly onAdd: (id: string) => void;
  readonly onNew: () => void;
  readonly onDelete: (id: string) => void;
  readonly onReset: () => void;
}

/** Settings -> Quick marks: which buttons the walk screen shows, in what order (spec S03-E). */
export function QuickMarksScreen(props: QuickMarksScreenProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const order = props.panel.map((m) => m.id);
  const byId = new Map(props.panel.map((m) => [m.id, m]));
  const full = panelIsFull(order);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Chip size="sm" label={i18n.t('common.back')} onPress={props.onBack} />
      </View>
      <AppText variant="numBig">{i18n.t('marks.title')}</AppText>
      <AppText variant="muted">{i18n.t('marks.hint')}</AppText>

      <Card variant="flat">
        <AppText variant="eyebrow" style={{ marginBottom: 8 }}>
          {i18n.t('marks.panel', { n: order.length, max: PANEL_LIMIT })}
        </AppText>
        {/* a small copy of the walk screen's grid, so the order is visible at a glance */}
        <View style={{ gap: 6 }}>
          {panelRows(order).map((row, r) => (
            <View key={String(r)} style={{ flexDirection: 'row', gap: 6 }}>
              {row.map((id, c) => {
                const mark = id === null ? undefined : byId.get(id);
                return (
                  <View
                    key={String(c)}
                    style={{
                      flex: 1,
                      minHeight: 54,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderStyle: mark === undefined ? 'dashed' : 'solid',
                      borderColor: colors.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      padding: 4,
                    }}
                  >
                    {mark === undefined ? null : (
                      <>
                        <MarkShape kind={mark.look} size={18} />
                        <AppText
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                          style={{ fontSize: 11, lineHeight: 14 }}
                        >
                          {mark.label}
                        </AppText>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </Card>

      <View>
        {props.panel.map((mark, index) => (
          <ListRow
            key={mark.id}
            title={mark.label}
            divider={index < props.panel.length - 1}
            iconNode={<MarkShape kind={mark.look} size={22} />}
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Chip
                  size="sm"
                  label="↑"
                  onPress={() => {
                    props.onMove(mark.id, -1);
                  }}
                />
                <Chip
                  size="sm"
                  label="↓"
                  onPress={() => {
                    props.onMove(mark.id, 1);
                  }}
                />
                <Chip
                  size="sm"
                  label={i18n.t('marks.remove')}
                  onPress={() => {
                    props.onRemove(mark.id);
                  }}
                />
              </View>
            }
          />
        ))}
      </View>

      {props.catalog.length === 0 ? null : (
        <View>
          <AppText variant="eyebrow" style={{ marginBottom: 4 }}>
            {i18n.t('marks.catalog')}
          </AppText>
          {full ? <AppText variant="muted">{i18n.t('marks.full')}</AppText> : null}
          {props.catalog.map((mark, index) => (
            <ListRow
              key={mark.id}
              title={mark.label}
              divider={index < props.catalog.length - 1}
              iconNode={<MarkShape kind={mark.look} size={22} />}
              right={
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {mark.custom ? (
                    <Chip
                      size="sm"
                      label={i18n.t('common.delete')}
                      onPress={() => {
                        props.onDelete(mark.id);
                      }}
                    />
                  ) : null}
                  <Chip
                    size="sm"
                    label={i18n.t('marks.add')}
                    onPress={() => {
                      if (!full) {
                        props.onAdd(mark.id);
                      }
                    }}
                  />
                </View>
              }
            />
          ))}
        </View>
      )}

      <Button label={i18n.t('marks.new')} icon="plus" onPress={props.onNew} />
      <Button label={i18n.t('marks.reset')} tone="ghost" onPress={props.onReset} />
    </Screen>
  );
}

export interface NewMarkSheetProps {
  readonly visible: boolean;
  /** No free slot: the new mark can only go to the catalog. */
  readonly panelFull: boolean;
  readonly onClose: () => void;
  readonly onCreate: (input: { label: string; look: EventKind; onPanel: boolean }) => void;
}

/** A mark of your own: a name and one of the seven looks (color and shape together). */
export function NewMarkSheet({ visible, panelFull, onClose, onCreate }: NewMarkSheetProps) {
  const i18n = useI18n();
  const { colors } = useTheme().theme;
  const [label, setLabel] = useState('');
  const [look, setLook] = useState<EventKind>('ex');
  const [onPanel, setOnPanel] = useState(true);
  useEffect(() => {
    if (visible) {
      setLabel('');
      setLook('ex');
      setOnPanel(true);
    }
    // reset only when the sheet opens
  }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose} title={i18n.t('marks.newTitle')}>
      <TextField
        label={i18n.t('marks.name')}
        value={label}
        onChangeText={setLabel}
        maxLength={24}
      />
      <View style={{ gap: 8 }}>
        <AppText variant="eyebrow">{i18n.t('marks.look')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {LOOKS.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={i18n.t(`marks.look.${kind}` as MessageKey)}
              accessibilityState={{ selected: look === kind }}
              onPress={() => {
                setLook(kind);
              }}
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                borderWidth: look === kind ? 2 : 1,
                borderColor: look === kind ? colors.accent : colors.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MarkShape kind={kind} size={26} />
            </Pressable>
          ))}
        </View>
        <AppText variant="muted">{i18n.t(`marks.look.${look}` as MessageKey)}</AppText>
      </View>
      {panelFull ? (
        <AppText variant="muted">{i18n.t('marks.full')}</AppText>
      ) : (
        <Chip
          label={i18n.t('marks.toPanel')}
          selected={onPanel}
          onPress={() => {
            setOnPanel(!onPanel);
          }}
        />
      )}
      <Button
        label={i18n.t('common.save')}
        disabled={label.trim() === ''}
        onPress={() => {
          onCreate({ label, look, onPanel: onPanel && !panelFull });
        }}
      />
    </Sheet>
  );
}
