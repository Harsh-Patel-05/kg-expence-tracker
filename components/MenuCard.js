import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Theme } from '../theme';
import QuantityStepper from './QuantityStepper';

const MenuCard = ({
  item,
  onAddToCart,
  quantity = 0,
  onQuantityChange,
  style,
}) => {
  const scale = useSharedValue(1);
  const addButtonScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const addButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: addButtonScale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.97, {}, () => {
      scale.value = withSpring(1);
    });
  };

  const handleAddPress = () => {
    addButtonScale.value = withSpring(0.9, {}, () => {
      addButtonScale.value = withSpring(1.1, {}, () => {
        addButtonScale.value = withSpring(1);
      });
    });
    onAddToCart?.(item);
  };

  return (
    <Animated.View style={[styles.container, animatedStyle, style]}>
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.9}
      >
        <View style={styles.imageContainer}>
          <Text style={styles.image}>{item.image}</Text>
        </View>
        
        <View style={styles.content}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
          
          <View style={styles.footer}>
            <Text style={styles.price}>${item.price}</Text>
            
            {quantity > 0 ? (
              <QuantityStepper
                value={quantity}
                onIncrease={() => onQuantityChange?.(item.id, quantity + 1)}
                onDecrease={() => onQuantityChange?.(item.id, quantity - 1)}
                size="small"
              />
            ) : (
              <Animated.View style={[styles.addButton, addButtonAnimatedStyle]}>
                <TouchableOpacity
                  style={styles.addTouchable}
                  onPress={handleAddPress}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addText}>+</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    maxWidth: '50%',
  },
  card: {
    backgroundColor: Theme.Colors.card,
    borderRadius: 12,
    padding: Theme.Spacing.md,
    margin: Theme.Spacing.xs,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    ...Theme.Shadows.card,
    height: 180,
  },
  imageContainer: {
    width: '100%',
    height: 60,
    backgroundColor: Theme.Colors.background,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.Spacing.sm,
  },
  image: {
    fontSize: 32,
  },
  content: {
    flex: 1,
  },
  name: {
    ...Theme.Typography.subtitle,
    marginBottom: Theme.Spacing.xs,
  },
  description: {
    ...Theme.Typography.small,
    flex: 1,
    marginBottom: Theme.Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    ...Theme.Typography.price,
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.Shadows.button,
  },
  addTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    color: Theme.Colors.card,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: undefined,
  },
});

export default MenuCard;
