import React from 'react';
import { ScrollView, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Theme } from '../theme';
import {
  MENU_CATEGORIES,
  type MenuCategoryId,
} from '../constants/menuItems';

type Props = {
  selected: MenuCategoryId;
  onChange: (id: MenuCategoryId) => void;
};

export function CategoryTabs({ selected, onChange }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {MENU_CATEGORIES.map((c) => {
          const active = selected === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => onChange(c.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Theme.Spacing.md,
  },
  scroll: {
    gap: Theme.Spacing.sm,
    paddingRight: Theme.Spacing.md,
  },
  tab: {
    paddingHorizontal: Theme.Spacing.lg,
    paddingVertical: Theme.Spacing.sm + 2,
    borderRadius: 999,
    backgroundColor: Theme.Colors.card,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  tabActive: {
    backgroundColor: Theme.Colors.primary,
    borderColor: Theme.Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.Colors.textSecondary,
  },
  tabTextActive: {
    color: Theme.Colors.card,
  },
});
