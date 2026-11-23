import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { Theme } from '../theme';

type Variant = 'primary' | 'outline' | 'accent' | 'ghost';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: Props) {
  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'accent' && styles.accent,
        variant === 'ghost' && styles.ghost,
        disabled && styles.disabled,
        Theme.Shadows.button,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
    >
      <Text
        style={[
          styles.text,
          variant === 'primary' && styles.textOnPrimary,
          variant === 'outline' && styles.textOutline,
          variant === 'accent' && styles.textAccent,
          variant === 'ghost' && styles.textGhost,
          disabled && styles.textDisabled,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Theme.Spacing.sm + 2,
    paddingHorizontal: Theme.Spacing.lg,
    minHeight: 44,
  },
  primary: {
    backgroundColor: Theme.Colors.primary,
  },
  outline: {
    backgroundColor: Theme.Colors.card,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  accent: {
    backgroundColor: Theme.Colors.accentYellow,
  },
  ghost: {
    backgroundColor: Theme.Colors.accentYellowLight,
    borderWidth: 1,
    borderColor: Theme.Colors.accentYellow,
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
  },
  textOnPrimary: {
    color: Theme.Colors.card,
  },
  textOutline: {
    color: Theme.Colors.textPrimary,
  },
  textAccent: {
    color: Theme.Colors.textPrimary,
  },
  textGhost: {
    color: Theme.Colors.textPrimary,
  },
  textDisabled: {
    color: Theme.Colors.textSecondary,
  },
});
