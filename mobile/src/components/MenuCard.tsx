import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Theme } from '../theme';
import type { MenuItem } from '../constants/menuItems';
import { formatRs } from '../utils/format';
import { QuantityStepper } from './QuantityStepper';

type Props = {
  item: MenuItem;
  quantity: number;
  maxWidthPct: string;
  onAdd: (item: MenuItem) => void;
  onQuantityChange: (id: string, qty: number) => void;
};

export function MenuCard({
  item,
  quantity,
  maxWidthPct,
  onAdd,
  onQuantityChange,
}: Props) {
  const cardScale = useSharedValue(1);
  const addScale = useSharedValue(1);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const addBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addScale.value }],
  }));

  const bounceAdd = () => {
    addScale.value = withSpring(0.94, { damping: 14, stiffness: 400 }, () => {
      addScale.value = withSpring(1, { damping: 12, stiffness: 320 });
    });
    onAdd(item);
  };

  return (
    <Animated.View style={[{ flex: 1, maxWidth: maxWidthPct as `${number}%` }, cardStyle]}>
      <Pressable
        onPressIn={() => {
          cardScale.value = withSpring(0.98, { damping: 20, stiffness: 400 });
        }}
        onPressOut={() => {
          cardScale.value = withSpring(1, { damping: 18, stiffness: 380 });
        }}
        style={styles.pressable}
      >
        <View style={[styles.card, Theme.Shadows.card]}>
          <View style={styles.imageBox}>
            <Text style={styles.imageEmoji}>{item.image}</Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.cat} numberOfLines={1}>
              {item.categoryLabel}
            </Text>
            <Text style={styles.price}>{formatRs(item.price)}</Text>
          </View>

          {quantity > 0 ? (
            <View style={styles.stepperRow}>
              <QuantityStepper
                value={quantity}
                onIncrease={() => onQuantityChange(item.id, quantity + 1)}
                onDecrease={() => onQuantityChange(item.id, quantity - 1)}
                size="small"
              />
            </View>
          ) : (
            <Animated.View style={addBtnStyle}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={bounceAdd}
                activeOpacity={0.9}
              >
                <Text style={styles.addLabel}>+ ADD</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    margin: Theme.Spacing.xs,
  },
  card: {
    backgroundColor: Theme.Colors.card,
    borderRadius: 16,
    padding: Theme.Spacing.md,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    minHeight: 200,
  },
  imageBox: {
    height: 72,
    borderRadius: 12,
    backgroundColor: Theme.Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.Spacing.sm,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  imageEmoji: {
    fontSize: 36,
  },
  name: {
    ...Theme.Typography.subtitle,
    fontSize: 15,
    marginBottom: Theme.Spacing.xs,
    minHeight: 40,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Theme.Spacing.sm,
    marginBottom: Theme.Spacing.md,
  },
  cat: {
    ...Theme.Typography.small,
    flex: 1,
    fontWeight: '500',
    color: Theme.Colors.textSecondary,
  },
  price: {
    ...Theme.Typography.price,
  },
  stepperRow: {
    alignItems: 'center',
    marginTop: 'auto',
  },
  addButton: {
    marginTop: 'auto',
    backgroundColor: Theme.Colors.primary,
    borderRadius: 12,
    paddingVertical: Theme.Spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.Shadows.button,
  },
  addLabel: {
    color: Theme.Colors.card,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
