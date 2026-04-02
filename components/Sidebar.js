import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../theme';
import { NAV_ITEMS } from '../constants/navigation';

const Sidebar = ({
  activeItem = 'dashboard',
  onItemPress,
  style,
}) => {
  const mainNavItems = NAV_ITEMS.slice(0, -2); // Exclude settings and profile
  const bottomNavItems = NAV_ITEMS.slice(-2); // Settings and profile

  const renderNavItem = (item, isBottom = false) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.navItem,
        activeItem === item.id && styles.navItemActive,
      ]}
      onPress={() => onItemPress?.(item.id)}
      activeOpacity={0.7}
    >
      <Text style={styles.navIcon}>{item.icon}</Text>
      <Text
        style={[
          styles.navText,
          activeItem === item.id && styles.navTextActive,
        ]}
      >
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.logo}>🍽️ POS</Text>
      </View>
      
      <ScrollView style={styles.mainNav} showsVerticalScrollIndicator={false}>
        {mainNavItems.map(renderNavItem)}
      </ScrollView>
      
      <View style={styles.bottomNav}>
        {bottomNavItems.map((item) => renderNavItem(item, true))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 240,
    backgroundColor: Theme.Colors.card,
    borderRightWidth: 1,
    borderRightColor: Theme.Colors.border,
    flexDirection: 'column',
  },
  header: {
    padding: Theme.Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Theme.Colors.border,
    alignItems: 'center',
  },
  logo: {
    fontSize: 20,
    fontWeight: '700',
    color: Theme.Colors.primary,
  },
  mainNav: {
    flex: 1,
    paddingVertical: Theme.Spacing.md,
  },
  bottomNav: {
    paddingVertical: Theme.Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Theme.Colors.border,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.Spacing.lg,
    paddingVertical: Theme.Spacing.md,
    marginHorizontal: Theme.Spacing.sm,
    marginVertical: Theme.Spacing.xs,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: Theme.Colors.accentYellowLight,
  },
  navIcon: {
    fontSize: 18,
    marginRight: Theme.Spacing.md,
  },
  navText: {
    ...Theme.Typography.body,
    color: Theme.Colors.textSecondary,
    fontWeight: '500',
  },
  navTextActive: {
    color: Theme.Colors.textPrimary,
    fontWeight: '600',
  },
});

export default Sidebar;
