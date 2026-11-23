import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Theme } from '../theme';
import { NAV_BOTTOM, NAV_ITEMS, type NavId } from '../constants/navigation';

type Props = {
  activeItem: NavId;
  onItemPress: (id: NavId) => void;
  compact?: boolean;
};

export function Sidebar({ activeItem, onItemPress, compact }: Props) {
  const renderItem = (id: NavId, name: string) => {
    const active = activeItem === id;
    return (
      <TouchableOpacity
        key={id}
        style={[
          styles.navItem,
          active && styles.navItemActive,
          compact && styles.navItemCompact,
          compact && active && styles.navItemCompactActive,
        ]}
        onPress={() => onItemPress(id)}
        activeOpacity={0.85}
      >
        {active && !compact && <View style={styles.activeBar} />}
        <Text
          style={[
            styles.navText,
            active && styles.navTextActive,
            compact && styles.navTextCompact,
            compact && active && styles.navTextCompactActive,
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>
      </TouchableOpacity>
    );
  };

  if (compact) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.compactRow}
      >
        {NAV_ITEMS.map((n) => renderItem(n.id, n.name))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <View style={styles.logoMark}>
          <Text style={styles.logoKg}>KG</Text>
        </View>
        <View style={styles.brandText}>
          <Text style={styles.brandThe}>THE </Text>
          <Text style={styles.brandKilo}>KILOGRAM</Text>
        </View>
      </View>

      <ScrollView
        style={styles.mainNav}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.mainNavContent}
      >
        {NAV_ITEMS.map((n) => renderItem(n.id, n.name))}
      </ScrollView>

      <View style={styles.bottom}>
        {NAV_BOTTOM.map((n) => renderItem(n.id, n.name))}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>N</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileName} numberOfLines={1}>
              Owner
            </Text>
            <Text style={styles.profileRole} numberOfLines={1}>
              Admin
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    backgroundColor: Theme.Colors.card,
    borderRightWidth: 1,
    borderRightColor: Theme.Colors.border,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.Spacing.lg,
    paddingVertical: Theme.Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Theme.Colors.border,
    gap: Theme.Spacing.sm,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.Colors.background,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoKg: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.Colors.primary,
  },
  brandText: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  brandThe: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.Colors.brandRed,
    letterSpacing: 0.5,
  },
  brandKilo: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.Colors.brandBlue,
    letterSpacing: 0.3,
  },
  mainNav: {
    flex: 1,
  },
  mainNavContent: {
    paddingVertical: Theme.Spacing.md,
    paddingRight: Theme.Spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Theme.Spacing.md,
    paddingLeft: Theme.Spacing.lg,
    marginLeft: Theme.Spacing.sm,
    marginVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  navItemCompact: {
    paddingHorizontal: Theme.Spacing.md,
    paddingVertical: Theme.Spacing.sm,
    marginHorizontal: Theme.Spacing.xs,
    marginVertical: 0,
  },
  navItemCompactActive: {
    backgroundColor: Theme.Colors.primary,
  },
  navItemActive: {
    backgroundColor: Theme.Colors.navActiveBg,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: Theme.Colors.primary,
  },
  navText: {
    ...Theme.Typography.body,
    color: Theme.Colors.textSecondary,
    fontWeight: '500',
    paddingLeft: Theme.Spacing.sm,
  },
  navTextActive: {
    color: Theme.Colors.textPrimary,
    fontWeight: '700',
  },
  navTextCompact: {
    paddingLeft: 0,
    fontSize: 12,
  },
  navTextCompactActive: {
    color: Theme.Colors.card,
  },
  bottom: {
    borderTopWidth: 1,
    borderTopColor: Theme.Colors.border,
    paddingVertical: Theme.Spacing.md,
    paddingRight: Theme.Spacing.sm,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Theme.Spacing.lg,
    marginTop: Theme.Spacing.md,
    padding: Theme.Spacing.md,
    borderRadius: 12,
    backgroundColor: Theme.Colors.background,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.Spacing.sm,
  },
  avatarText: {
    color: Theme.Colors.card,
    fontWeight: '700',
    fontSize: 14,
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    ...Theme.Typography.body,
    fontWeight: '600',
  },
  profileRole: {
    ...Theme.Typography.small,
    marginTop: 2,
  },
  compactRow: {
    paddingHorizontal: Theme.Spacing.sm,
    paddingVertical: Theme.Spacing.sm,
    alignItems: 'center',
    gap: Theme.Spacing.xs,
  },
});
