import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Theme } from '../theme';

const Button = ({
  title,
  onPress,
  variant = 'primary', // primary, secondary, accent
  size = 'medium', // small, medium, large
  disabled = false,
  style,
  ...props
}) => {
  const getButtonStyle = () => {
    const baseStyle = {
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      ...Theme.Shadows.button,
    };

    const sizeStyle = {
      small: {
        paddingHorizontal: Theme.Spacing.md,
        paddingVertical: Theme.Spacing.sm,
        minHeight: 36,
      },
      medium: {
        paddingHorizontal: Theme.Spacing.lg,
        paddingVertical: Theme.Spacing.md,
        minHeight: 44,
      },
      large: {
        paddingHorizontal: Theme.Spacing.xl,
        paddingVertical: Theme.Spacing.lg,
        minHeight: 52,
      },
    };

    const variantStyle = {
      primary: {
        backgroundColor: disabled ? Theme.Colors.border : Theme.Colors.primary,
      },
      secondary: {
        backgroundColor: disabled ? Theme.Colors.border : Theme.Colors.card,
        borderWidth: 1,
        borderColor: Theme.Colors.border,
      },
      accent: {
        backgroundColor: disabled ? Theme.Colors.border : Theme.Colors.accentYellow,
      },
    };

    return {
      ...baseStyle,
      ...sizeStyle[size],
      ...variantStyle[variant],
    };
  };

  const getTextStyle = () => {
    const baseStyle = {
      fontWeight: '600',
    };

    const sizeStyle = {
      small: { fontSize: 12 },
      medium: { fontSize: 14 },
      large: { fontSize: 16 },
    };

    const variantStyle = {
      primary: {
        color: disabled ? Theme.Colors.textSecondary : Theme.Colors.card,
      },
      secondary: {
        color: disabled ? Theme.Colors.textSecondary : Theme.Colors.textPrimary,
      },
      accent: {
        color: disabled ? Theme.Colors.textSecondary : Theme.Colors.textPrimary,
      },
    };

    return {
      ...baseStyle,
      ...sizeStyle[size],
      ...variantStyle[variant],
    };
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      {...props}
    >
      <Text style={getTextStyle()}>{title}</Text>
    </TouchableOpacity>
  );
};

export default Button;
