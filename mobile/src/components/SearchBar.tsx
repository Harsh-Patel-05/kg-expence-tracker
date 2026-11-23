import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Theme } from '../theme';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search menu...',
}: Props) {
  const [focused, setFocused] = useState(false);
  const focusScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: focusScale.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <View
        style={[
          styles.row,
          focused && styles.rowFocused,
          Theme.Shadows.card,
        ]}
      >
        <Text style={styles.icon}>🔍</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Theme.Colors.textSecondary}
          onFocus={() => {
            setFocused(true);
            focusScale.value = withSpring(1.01);
          }}
          onBlur={() => {
            setFocused(false);
            focusScale.value = withSpring(1);
          }}
          returnKeyType="search"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    marginBottom: Theme.Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    paddingHorizontal: Theme.Spacing.md,
    minHeight: 48,
  },
  rowFocused: {
    borderColor: Theme.Colors.primary,
    borderWidth: 1.5,
  },
  icon: {
    fontSize: 16,
    marginRight: Theme.Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Theme.Colors.textPrimary,
    paddingVertical: Theme.Spacing.sm,
  },
});
