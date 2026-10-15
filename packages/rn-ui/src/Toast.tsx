import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from './ThemeProvider';

export interface ToastOptions {
  readonly message: string;
  /** Label of the single action button, e.g. "Undo" for deletions (G-02). */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  /** Default 4 seconds; deletions use 8 (G-02). */
  readonly durationMs?: number;
}

interface ToastApi {
  show(options: ToastOptions): void;
  hide(): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  readonly children: ReactNode;
  /** Distance from the bottom edge, so toasts sit above the tab bar and never cover it. */
  readonly bottomOffset?: number;
}

/** One toast at a time: a new one replaces the old one. */
export function ToastProvider({ children, bottomOffset = 90 }: ToastProviderProps) {
  const { colors } = useTheme().theme;
  const [current, setCurrent] = useState<ToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setCurrent(null);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      setCurrent(options);
      timer.current = setTimeout(hide, options.durationMs ?? 4000);
    },
    [hide],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const api = useMemo<ToastApi>(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current === null ? null : (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 12, right: 12, bottom: bottomOffset }}
        >
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              backgroundColor: colors.ink,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              minHeight: 48,
            }}
          >
            <AppText style={{ color: colors.bg, flex: 1 }}>{current.message}</AppText>
            {current.actionLabel === undefined ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  current.onAction?.();
                  hide();
                }}
                hitSlop={10}
              >
                <AppText weight={700} style={{ color: colors.accentSoft }}>
                  {current.actionLabel}
                </AppText>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

/** @throws Error when used outside a ToastProvider. */
export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (value === null) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return value;
}
