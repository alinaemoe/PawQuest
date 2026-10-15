import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
} from '@expo-google-fonts/onest';
import {
  Unbounded_400Regular,
  Unbounded_500Medium,
  Unbounded_600SemiBold,
  Unbounded_700Bold,
} from '@expo-google-fonts/unbounded';
import { NATIVE_FONT_FAMILIES } from '@pawquest/rn-ui';

/** Keys are the family names the components ask for (typography.ts in rn-ui). */
export const FONT_ASSETS = {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Unbounded_400Regular,
  Unbounded_500Medium,
  Unbounded_600SemiBold,
  Unbounded_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
};

/** A guard against drifting apart: every family the UI can request must be loaded. */
export function missingFontFamilies(): string[] {
  return NATIVE_FONT_FAMILIES.filter((name) => !(name in FONT_ASSETS));
}
