import React from 'react';
import { ScrollView, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Theme } from '../theme';
import { MENU_CATEGORIES } from '../constants/menuItems';

const CategoryTabs = ({
  selectedCategory = 'all',
  onCategoryChange,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {MENU_CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.tab,
              selectedCategory === category.id && styles.tabActive,
            ]}
            onPress={() => onCategoryChange?.(category.id)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                selectedCategory === category.id && styles.tabTextActive,
              ]}
            >
              {category.icon} {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Theme.Spacing.md,
  },
  scrollContent: {
    paddingHorizontal: Theme.Spacing.md,
    gap: Theme.Spacing.sm,
  },
  tab: {
    paddingHorizontal: Theme.Spacing.md,
    paddingVertical: Theme.Spacing.sm,
    borderRadius: 8,
    backgroundColor: Theme.Colors.card,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    minWidth: 80,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Theme.Colors.accentYellowLight,
    borderColor: Theme.Colors.accentYellow,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.Colors.textSecondary,
  },
  tabTextActive: {
    color: Theme.Colors.textPrimary,
    fontWeight: '600',
  },
});

export default CategoryTabs;
