import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Theme } from '../theme';

const QuantityStepper = ({
  value = 0,
  onIncrease,
  onDecrease,
  min = 0,
  max = 99,
  size = 'medium',
}) => {
  const plusScale = useSharedValue(1);
  const minusScale = useSharedValue(1);

  const plusAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: plusScale.value }],
  }));

  const minusAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: minusScale.value }],
  }));

  const handlePlusPress = () => {
    if (value < max) {
      plusScale.value = withSpring(0.9, {}, () => {
        plusScale.value = withSpring(1);
      });
      onIncrease?.();
    }
  };

  const handleMinusPress = () => {
    if (value > min) {
      minusScale.value = withSpring(0.9, {}, () => {
        minusScale.value = withSpring(1);
      });
      onDecrease?.();
    }
  };

  const getSizeStyle = () => {
    const sizes = {
      small: {
        button: {
          width: 24,
          height: 24,
          borderRadius: 12,
        },
        text: {
          fontSize: 12,
        },
        container: {
          height: 32,
        },
      },
      medium: {
        button: {
          width: 32,
          height: 32,
          borderRadius: 16,
        },
        text: {
          fontSize: 14,
        },
        container: {
          height: 40,
        },
      },
      large: {
        button: {
          width: 40,
          height: 40,
          borderRadius: 20,
        },
        text: {
          fontSize: 16,
        },
        container: {
          height: 48,
        },
      },
    };
    return sizes[size];
  };

  const sizeStyle = getSizeStyle();

  return (
    <View style={[styles.container, sizeStyle.container]}>
      <Animated.View style={[sizeStyle.button, styles.button, minusAnimatedStyle]}>
        <TouchableOpacity
          style={styles.buttonTouchable}
          onPress={handleMinusPress}
          disabled={value <= min}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.buttonText,
              sizeStyle.text,
              value <= min && styles.buttonTextDisabled,
            ]}
          >
            −
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.valueContainer}>
        <Text style={[styles.value, sizeStyle.text]}>{value}</Text>
      </View>

      <Animated.View style={[sizeStyle.button, styles.button, plusAnimatedStyle]}>
        <TouchableOpacity
          style={styles.buttonTouchable}
          onPress={handlePlusPress}
          disabled={value >= max}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.buttonText,
              sizeStyle.text,
              value >= max && styles.buttonTextDisabled,
            ]}
          >
            +
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.Spacing.sm,
  },
  button: {
    backgroundColor: Theme.Colors.card,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    ...Theme.Shadows.button,
  },
  buttonTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: Theme.Colors.textPrimary,
    fontWeight: '600',
    lineHeight: undefined,
  },
  buttonTextDisabled: {
    color: Theme.Colors.textSecondary,
  },
  valueContainer: {
    minWidth: 40,
    alignItems: 'center',
  },
  value: {
    color: Theme.Colors.textPrimary,
    fontWeight: '600',
  },
});

export default QuantityStepper;
