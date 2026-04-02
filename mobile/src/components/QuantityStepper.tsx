import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { Theme } from '../theme';

type Size = 'small' | 'medium';

type Props = {
  value: number;
  onIncrease: () => void;
  onDecrease: () => void;
  min?: number;
  max?: number;
  size?: Size;
};

const SIZES: Record<
  Size,
  { btn: number; font: number; h: number }
> = {
  small: { btn: 28, font: 16, h: 36 },
  medium: { btn: 36, font: 18, h: 44 },
};

export function QuantityStepper({
  value,
  onIncrease,
  onDecrease,
  min = 0,
  max = 99,
  size = 'medium',
}: Props) {
  const plusS = useSharedValue(1);
  const minusS = useSharedValue(1);
  const dim = SIZES[size];

  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ scale: plusS.value }],
  }));
  const minusStyle = useAnimatedStyle(() => ({
    transform: [{ scale: minusS.value }],
  }));

  const bump = (sv: SharedValue<number>, fn: () => void) => {
    sv.value = withSpring(0.9, { damping: 14, stiffness: 400 }, () => {
      sv.value = withSpring(1);
    });
    fn();
  };

  return (
    <View style={[styles.row, { height: dim.h }]}>
      <Animated.View
        style={[
          styles.btn,
          { width: dim.btn, height: dim.btn, borderRadius: dim.btn / 2 },
          minusStyle,
        ]}
      >
        <TouchableOpacity
          style={styles.btnInner}
          disabled={value <= min}
          onPress={() => bump(minusS, onDecrease)}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.btnText,
              { fontSize: dim.font },
              value <= min && styles.btnTextDisabled,
            ]}
          >
            −
          </Text>
        </TouchableOpacity>
      </Animated.View>
      <Text style={[styles.val, { fontSize: dim.font - 2 }]}>{value}</Text>
      <Animated.View
        style={[
          styles.btn,
          { width: dim.btn, height: dim.btn, borderRadius: dim.btn / 2 },
          plusStyle,
        ]}
      >
        <TouchableOpacity
          style={styles.btnInner}
          disabled={value >= max}
          onPress={() => bump(plusS, onIncrease)}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.btnText,
              { fontSize: dim.font },
              value >= max && styles.btnTextDisabled,
            ]}
          >
            +
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.Spacing.md,
  },
  btn: {
    backgroundColor: Theme.Colors.card,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    ...Theme.Shadows.button,
  },
  btnInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontWeight: '700',
    color: Theme.Colors.textPrimary,
  },
  btnTextDisabled: {
    color: Theme.Colors.textSecondary,
  },
  val: {
    fontWeight: '700',
    color: Theme.Colors.textPrimary,
    minWidth: 28,
    textAlign: 'center',
  },
});
