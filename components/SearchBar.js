import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Theme } from '../theme';

const SearchBar = ({
  value = '',
  onChangeText,
  placeholder = 'Search menu...',
  onFocus,
  onBlur,
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const focusScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: focusScale.value }],
  }));

  const handleFocus = () => {
    setIsFocused(true);
    focusScale.value = withSpring(1.02);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    focusScale.value = withSpring(1);
    onBlur?.();
  };

  return (
    <Animated.View style={[styles.container, animatedStyle, style]}>
      <View style={[styles.inputContainer, isFocused && styles.inputContainerFocused]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Theme.Colors.textSecondary}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        <TouchableOpacity style={styles.iconContainer}>
          {/* You can add a search icon here */}
          <Text style={styles.icon}>🔍</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Theme.Spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    paddingHorizontal: Theme.Spacing.md,
    ...Theme.Shadows.card,
  },
  inputContainerFocused: {
    borderColor: Theme.Colors.primary,
    borderWidth: 2,
  },
  input: {
    flex: 1,
    paddingVertical: Theme.Spacing.md,
    fontSize: 14,
    color: Theme.Colors.textPrimary,
  },
  iconContainer: {
    padding: Theme.Spacing.sm,
  },
  icon: {
    fontSize: 16,
  },
});

export default SearchBar;
