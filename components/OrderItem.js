import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Theme } from '../theme';
import QuantityStepper from './QuantityStepper';

const OrderItem = ({
  item,
  onQuantityChange,
  onRemove,
  onEdit,
  style,
}) => {
  const subtotal = item.price * item.quantity;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.imageContainer}>
        <Text style={styles.image}>{item.image}</Text>
      </View>
      
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name}>{item.name}</Text>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => onRemove?.(item.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.removeText}>×</Text>
          </TouchableOpacity>
        </View>
        
        {item.notes && (
          <Text style={styles.notes} numberOfLines={1}>
            Note: {item.notes}
          </Text>
        )}
        
        <View style={styles.footer}>
          <QuantityStepper
            value={item.quantity}
            onIncrease={() => onQuantityChange?.(item.id, item.quantity + 1)}
            onDecrease={() => onQuantityChange?.(item.id, item.quantity - 1)}
            size="small"
          />
          
          <Text style={styles.price}>${subtotal.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Theme.Colors.card,
    borderRadius: 12,
    padding: Theme.Spacing.md,
    marginHorizontal: Theme.Spacing.md,
    marginVertical: Theme.Spacing.xs,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  imageContainer: {
    width: 40,
    height: 40,
    backgroundColor: Theme.Colors.background,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.Spacing.md,
  },
  image: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Theme.Spacing.xs,
  },
  name: {
    ...Theme.Typography.subtitle,
    flex: 1,
  },
  removeButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: Theme.Colors.card,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: undefined,
  },
  notes: {
    ...Theme.Typography.small,
    fontStyle: 'italic',
    marginBottom: Theme.Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    ...Theme.Typography.priceLarge,
  },
});

export default OrderItem;
