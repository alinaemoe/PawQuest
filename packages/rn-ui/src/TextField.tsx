import { useState } from 'react';
import { TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';
import { fontStyle } from './typography';

export interface TextFieldProps {
  readonly label?: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  readonly autoFocus?: boolean;
  readonly multiline?: boolean;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly maxLength?: number;
  readonly returnKeyType?: 'done' | 'next' | 'go';
  readonly onSubmitEditing?: () => void;
}

/** Text input with an eyebrow label; the focus state is an accent border. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  autoFocus,
  multiline = false,
  keyboardType,
  maxLength,
  returnKeyType,
  onSubmitEditing,
}: TextFieldProps) {
  const { colors } = useTheme().theme;
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label === undefined ? null : <AppText variant="eyebrow">{label}</AppText>}
      <TextInput
        accessibilityLabel={label ?? placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoFocus={autoFocus}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        submitBehavior={multiline ? 'newline' : 'blurAndSubmit'}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        style={{
          ...fontStyle('body', 400),
          fontSize: 16,
          color: colors.ink,
          backgroundColor: colors.surface,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.accent : colors.line,
          borderRadius: 14,
          paddingHorizontal: focused ? 13 : 14,
          paddingVertical: multiline ? 12 : 10,
          minHeight: multiline ? 96 : 48,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}
