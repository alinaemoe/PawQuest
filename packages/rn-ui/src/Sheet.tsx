import { metrics } from '@pawquest/ui';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';

export interface SheetProps {
  readonly visible: boolean;
  /** Called by the system back button, a tap on the dimmed area and the grab handle. */
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: ReactNode;
}

/** A bottom sheet over a dimmed screen (docs/03 G-04: sheets, never blocking dialogs). */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { colors } = useTheme().theme;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(10,16,12,0.38)',
          }}
        />
        <View
          style={{
            maxHeight: height * 0.88,
            backgroundColor: colors.surface,
            borderTopLeftRadius: metrics.radius.sheet,
            borderTopRightRadius: metrics.radius.sheet,
            paddingTop: 10,
            paddingHorizontal: 16,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <Pressable
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ alignItems: 'center', paddingVertical: 4, marginBottom: 8 }}
          >
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
          </Pressable>
          {title === undefined ? null : (
            <AppText variant="title" style={{ marginBottom: 12 }}>
              {title}
            </AppText>
          )}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
