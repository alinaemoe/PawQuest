import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { useTheme } from './ThemeProvider';

export interface HoldButtonProps {
  /** How long the press must be held before it counts, in ms. */
  readonly holdMs?: number;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  /** The hold was completed: the action runs. */
  readonly onComplete: () => void;
  /** A short tap that was let go before the hold finished (usually shows how to use the button). */
  readonly onTap?: () => void;
  readonly flex?: number;
  readonly children: ReactNode;
}

/**
 * A button for an action that is hard to undo (finishing a walk): it fills from left to right
 * while held and fires when the fill reaches the end. Letting go early drains it back and counts
 * as a tap. Screen readers get a plain "activate" action instead of the hold.
 */
export function HoldButton({
  holdMs = 1000,
  accessibilityLabel,
  accessibilityHint,
  onComplete,
  onTap,
  flex = 1,
  children,
}: HoldButtonProps) {
  const { colors } = useTheme().theme;
  const progress = useRef(new Animated.Value(0)).current;
  const holding = useRef<Animated.CompositeAnimation | null>(null);
  const done = useRef(false);

  useEffect(
    () => () => {
      holding.current?.stop();
    },
    [],
  );

  const drain = (): void => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const begin = (): void => {
    done.current = false;
    progress.stopAnimation();
    progress.setValue(0);
    holding.current = Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    holding.current.start(({ finished }) => {
      if (finished) {
        done.current = true;
        onComplete();
        // leave the fill for a moment, then reset for the next time
        setTimeout(() => {
          progress.setValue(0);
        }, 400);
      }
    });
  };

  const release = (): void => {
    if (done.current) {
      return;
    }
    holding.current?.stop();
    drain();
    onTap?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onComplete}
      onPressIn={begin}
      onPressOut={release}
      style={{ flex }}
    >
      <View
        style={{
          minHeight: 48,
          borderRadius: 16,
          backgroundColor: colors.surface2,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.accent,
            opacity: 0.5,
            transformOrigin: 'left center',
            transform: [{ scaleX: progress }],
          }}
        />
        {children}
      </View>
    </Pressable>
  );
}
