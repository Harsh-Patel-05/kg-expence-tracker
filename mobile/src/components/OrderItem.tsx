import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Theme } from '../theme';
import { formatRs } from '../utils/format';
import { QuantityStepper } from './QuantityStepper';
import type { MenuItem } from '../constants/menuItems';

export type CartLine = MenuItem & { quantity: number; notes?: string };

type Props = {
  line: CartLine;
  onQuantityChange: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
};

export function OrderItem({ line, onQuantityChange, onRemove }: Props) {
  const sub = line.price * line.quantity;
  return (
    <View style={[styles.row, Theme.Shadows.card]}>
      <View style={styles.thumb}>
        <Text style={styles.thumbEmoji}>{line.image}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={2}>
            {line.name}
          </Text>
          <TouchableOpacity
            onPress={() => onRemove(line.id)}
            style={styles.remove}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={styles.removeTxt}>×</Text>
          </TouchableOpacity>
        </View>
        {line.notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            {line.notes}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <QuantityStepper
            value={line.quantity}
            onIncrease={() => onQuantityChange(line.id, line.quantity + 1)}
            onDecrease={() => onQuantityChange(line.id, line.quantity - 1)}
            size="small"
          />
          <Text style={styles.price}>{formatRs(sub)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: Theme.Colors.card,
    borderRadius: 14,
    padding: Theme.Spacing.md,
    marginBottom: Theme.Spacing.sm,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Theme.Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.Spacing.md,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  thumbEmoji: {
    fontSize: 22,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Theme.Spacing.sm,
  },
  name: {
    ...Theme.Typography.body,
    fontWeight: '700',
    flex: 1,
  },
  remove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeTxt: {
    color: Theme.Colors.card,
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  },
  notes: {
    ...Theme.Typography.small,
    fontStyle: 'italic',
    marginTop: Theme.Spacing.xs,
    marginBottom: Theme.Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Theme.Spacing.xs,
  },
  price: {
    ...Theme.Typography.priceLarge,
  },
});
