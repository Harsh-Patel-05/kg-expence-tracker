import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  SafeAreaView,
  useWindowDimensions,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Theme } from '../theme';
import { Sidebar } from '../components/Sidebar';
import { SearchBar } from '../components/SearchBar';
import { CategoryTabs } from '../components/CategoryTabs';
import { MenuCard } from '../components/MenuCard';
import { OrderItem, type CartLine } from '../components/OrderItem';
import { Button } from '../components/Button';
import {
  SAMPLE_MENU_ITEMS,
  type MenuCategoryId,
} from '../constants/menuItems';
import type { NavId } from '../constants/navigation';
import { formatRs } from '../utils/format';

const PAYMENT_MODES = ['Cash', 'Online', 'UPI'] as const;

export function POSScreen() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const cols = width >= 1024 ? 4 : 2;
  const colPct = `${100 / cols}%`;
  const mobileOrderMaxH = Math.round(height * 0.46);

  const [activeNav, setActiveNav] = useState<NavId>('pos');
  const [hideSidebar, setHideSidebar] = useState(!isTablet);
  const [category, setCategory] = useState<MenuCategoryId>('all');
  const [query, setQuery] = useState('');
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [orderNote, setOrderNote] = useState('');
  const [taxInput, setTaxInput] = useState('');
  const [payment, setPayment] =
    useState<(typeof PAYMENT_MODES)[number]>('Cash');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SAMPLE_MENU_ITEMS.filter((item) => {
      const catOk = category === 'all' ? true : item.category === category;
      const qOk =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [category, query]);

  const cartLines: CartLine[] = useMemo(() => {
    return Object.entries(cartQty)
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => {
        const base = SAMPLE_MENU_ITEMS.find((m) => m.id === id)!;
        return { ...base, quantity };
      });
  }, [cartQty]);

  const itemCount = cartLines.reduce((s, l) => s + l.quantity, 0);

  const totals = useMemo(() => {
    const subtotal = cartLines.reduce(
      (s, l) => s + l.price * l.quantity,
      0
    );
    const taxPct = Math.max(0, parseFloat(taxInput) || 0);
    const tax = subtotal * (taxPct / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [cartLines, taxInput]);

  const addItem = useCallback((item: (typeof SAMPLE_MENU_ITEMS)[0]) => {
    setCartQty((prev) => ({
      ...prev,
      [item.id]: (prev[item.id] ?? 0) + 1,
    }));
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setCartQty((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }, []);

  const resetCart = useCallback(() => {
    setCartQty({});
    setOrderNote('');
    setTaxInput('');
  }, []);

  const headerActions = (
    <View style={styles.headerActions}>
      <TouchableOpacity
        style={styles.pill}
        onPress={() => setHideSidebar((h) => !h)}
        activeOpacity={0.85}
      >
        <Text style={styles.pillText}>
          {hideSidebar ? 'Show Sidebar' : 'Hide Sidebar'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.pillMuted} activeOpacity={0.85}>
        <Text style={styles.pillMutedText}>Today sales</Text>
      </TouchableOpacity>
    </View>
  );

  const listHeader = (
    <View style={styles.listHeaderPad}>
      {!isTablet ? (
        <View style={styles.mobileHeaderTop}>{headerActions}</View>
      ) : null}
      <View style={styles.menuHeaderRow}>
        <SearchBar value={query} onChangeText={setQuery} />
        {isTablet ? headerActions : null}
      </View>
      <CategoryTabs selected={category} onChange={setCategory} />
    </View>
  );

  const renderCartBlock = (scrollCart: boolean) => {
    const cartInner =
      cartLines.length === 0 ? (
        <Text style={styles.cartEmpty}>Cart is empty</Text>
      ) : (
        cartLines.map((line) => (
          <OrderItem
            key={line.id}
            line={line}
            onQuantityChange={setQty}
            onRemove={(id) => setQty(id, 0)}
          />
        ))
      );

    if (scrollCart) {
      return (
        <ScrollView
          style={styles.cartScroll}
          contentContainerStyle={styles.cartContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {cartInner}
        </ScrollView>
      );
    }
    return <View style={styles.cartBlockStatic}>{cartInner}</View>;
  };

  const orderBody = (scrollCart: boolean) => (
    <>
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderTitle}>Current Order</Text>
          <Text style={styles.orderSub}>
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </Text>
        </View>
        <TouchableOpacity onPress={resetCart} hitSlop={12} activeOpacity={0.8}>
          <Text style={styles.reset}>Reset</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.salesRow}>
        <View style={[styles.salesCard, Theme.Shadows.card]}>
          <Text style={styles.salesLabel}>Today Cash</Text>
          <Text style={styles.salesValue}>{formatRs(2000)}</Text>
        </View>
        <View style={[styles.salesCard, Theme.Shadows.card]}>
          <Text style={styles.salesLabel}>Today Online</Text>
          <Text style={styles.salesValue}>{formatRs(300)}</Text>
        </View>
      </View>

      <View style={[styles.historyCard, Theme.Shadows.card]}>
        <Text style={styles.historyText}>
          2026-03-31 • 1 sale(s) {formatRs(2300)}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Cart</Text>
      {renderCartBlock(scrollCart)}

      <Text style={styles.sectionLabel}>Order note (optional)</Text>
      <TextInput
        style={styles.input}
        value={orderNote}
        onChangeText={setOrderNote}
        placeholder="Add a note for the kitchen…"
        placeholderTextColor={Theme.Colors.textSecondary}
      />

      <View style={styles.taxPayRow}>
        <View style={styles.taxBox}>
          <Text style={styles.fieldLabel}>Tax (optional %)</Text>
          <TextInput
            style={styles.inputSmall}
            value={taxInput}
            onChangeText={setTaxInput}
            placeholder="0"
            keyboardType="decimal-pad"
            placeholderTextColor={Theme.Colors.textSecondary}
          />
        </View>
        <View style={styles.payBox}>
          <Text style={styles.fieldLabel}>Payment mode</Text>
          <View style={styles.payChips}>
            {PAYMENT_MODES.map((m) => {
              const on = payment === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setPayment(m)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {m}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.totalsBox}>
        <View style={styles.totalLine}>
          <Text style={styles.totalLineLabel}>Subtotal</Text>
          <Text style={styles.totalLineValue}>{formatRs(totals.subtotal)}</Text>
        </View>
        <View style={styles.totalLine}>
          <Text style={styles.totalLineLabel}>Tax</Text>
          <Text style={styles.totalLineValue}>{formatRs(totals.tax)}</Text>
        </View>
        <View style={styles.totalGrand}>
          <Text style={styles.totalGrandLabel}>Total</Text>
          <Text style={styles.totalGrandValue}>{formatRs(totals.total)}</Text>
        </View>
      </View>

      <View style={styles.footerBtns}>
        <View style={styles.row3}>
          <Button
            title="Print KOT"
            variant="outline"
            style={styles.flex1}
            onPress={() => {}}
          />
          <Button
            title="Print Bill"
            variant="outline"
            style={styles.flex1}
            onPress={() => {}}
          />
          <Button
            title="Hold"
            variant="ghost"
            style={styles.flex1}
            onPress={() => {}}
          />
        </View>
        <Button
          title="Charge"
          variant="primary"
          style={styles.chargeBtn}
          onPress={() => {}}
        />
      </View>
    </>
  );

  const orderPanelTablet = (
    <View style={styles.orderPanel}>{orderBody(true)}</View>
  );

  const orderPanelMobile = (
    <View style={[styles.orderPanel, styles.orderPanelMobile]}>
      <ScrollView
        style={{ maxHeight: mobileOrderMaxH }}
        contentContainerStyle={styles.orderMobileScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {orderBody(false)}
      </ScrollView>
    </View>
  );

  const menuList = (
    <FlatList
      key={`cols-${cols}-tablet-${isTablet}`}
      data={filtered}
      numColumns={cols}
      keyExtractor={(item) => item.id}
      style={styles.menuList}
      columnWrapperStyle={cols > 1 ? styles.colWrap : undefined}
      contentContainerStyle={styles.gridContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <MenuCard
          item={item}
          quantity={cartQty[item.id] ?? 0}
          maxWidthPct={colPct}
          onAdd={addItem}
          onQuantityChange={setQty}
        />
      )}
      ListEmptyComponent={
        <Text style={styles.emptyMenu}>No dishes match your search.</Text>
      }
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isTablet ? (
          <View style={styles.rowMain}>
            {!hideSidebar && (
              <Sidebar activeItem={activeNav} onItemPress={setActiveNav} />
            )}
            <View style={styles.menuFlex}>{menuList}</View>
            {orderPanelTablet}
          </View>
        ) : (
          <View style={styles.flex}>
            {!hideSidebar && (
              <View style={styles.compactNav}>
                <Sidebar
                  activeItem={activeNav}
                  onItemPress={setActiveNav}
                  compact
                />
              </View>
            )}
            <View style={styles.menuFlex}>{menuList}</View>
            {orderPanelMobile}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.Colors.background,
  },
  flex: {
    flex: 1,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
  },
  menuFlex: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  menuList: {
    flex: 1,
  },
  listHeaderPad: {
    paddingHorizontal: Theme.Spacing.lg,
    paddingTop: Theme.Spacing.lg,
    paddingBottom: Theme.Spacing.sm,
  },
  mobileHeaderTop: {
    marginBottom: Theme.Spacing.sm,
  },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.Spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.Spacing.sm,
    paddingTop: 4,
  },
  pill: {
    paddingHorizontal: Theme.Spacing.md,
    paddingVertical: Theme.Spacing.sm,
    borderRadius: 999,
    backgroundColor: Theme.Colors.card,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    ...Theme.Shadows.button,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.Colors.textPrimary,
  },
  pillMuted: {
    paddingHorizontal: Theme.Spacing.md,
    paddingVertical: Theme.Spacing.sm,
    borderRadius: 999,
    backgroundColor: Theme.Colors.navActiveBg,
    borderWidth: 1,
    borderColor: Theme.Colors.primaryLight,
  },
  pillMutedText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.Colors.primary,
  },
  colWrap: {
    justifyContent: 'flex-start',
    paddingHorizontal: Theme.Spacing.lg,
  },
  gridContent: {
    paddingBottom: Theme.Spacing.xxl,
  },
  emptyMenu: {
    ...Theme.Typography.body,
    color: Theme.Colors.textSecondary,
    textAlign: 'center',
    marginTop: Theme.Spacing.xl,
  },
  orderPanel: {
    width: 340,
    backgroundColor: Theme.Colors.card,
    borderLeftWidth: 1,
    borderLeftColor: Theme.Colors.border,
    padding: Theme.Spacing.lg,
  },
  orderPanelMobile: {
    width: '100%',
    maxWidth: '100%',
    borderLeftWidth: 0,
    borderTopWidth: 1,
    borderTopColor: Theme.Colors.border,
    flexShrink: 0,
  },
  orderMobileScroll: {
    paddingBottom: Theme.Spacing.lg,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Theme.Spacing.md,
  },
  orderTitle: {
    ...Theme.Typography.title,
  },
  orderSub: {
    ...Theme.Typography.small,
    marginTop: 2,
    fontWeight: '600',
    color: Theme.Colors.textSecondary,
  },
  reset: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.Colors.primary,
  },
  salesRow: {
    flexDirection: 'row',
    gap: Theme.Spacing.sm,
    marginBottom: Theme.Spacing.sm,
  },
  salesCard: {
    flex: 1,
    backgroundColor: Theme.Colors.background,
    borderRadius: 12,
    padding: Theme.Spacing.md,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  salesLabel: {
    ...Theme.Typography.small,
    fontWeight: '600',
    marginBottom: 4,
  },
  salesValue: {
    ...Theme.Typography.subtitle,
    color: Theme.Colors.primary,
  },
  historyCard: {
    backgroundColor: Theme.Colors.background,
    borderRadius: 12,
    padding: Theme.Spacing.md,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    marginBottom: Theme.Spacing.md,
  },
  historyText: {
    ...Theme.Typography.small,
    fontWeight: '600',
    color: Theme.Colors.textPrimary,
  },
  sectionLabel: {
    ...Theme.Typography.small,
    fontWeight: '700',
    color: Theme.Colors.textSecondary,
    marginBottom: Theme.Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cartScroll: {
    maxHeight: 220,
    marginBottom: Theme.Spacing.md,
  },
  cartContent: {
    paddingBottom: Theme.Spacing.sm,
  },
  cartBlockStatic: {
    marginBottom: Theme.Spacing.md,
  },
  cartEmpty: {
    ...Theme.Typography.body,
    color: Theme.Colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: Theme.Spacing.lg,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    borderRadius: 12,
    paddingHorizontal: Theme.Spacing.md,
    paddingVertical: Theme.Spacing.sm + 2,
    fontSize: 14,
    color: Theme.Colors.textPrimary,
    backgroundColor: Theme.Colors.card,
    marginBottom: Theme.Spacing.md,
  },
  taxPayRow: {
    flexDirection: 'row',
    gap: Theme.Spacing.sm,
    marginBottom: Theme.Spacing.sm,
  },
  taxBox: {
    width: 100,
  },
  payBox: {
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    ...Theme.Typography.small,
    fontWeight: '700',
    marginBottom: Theme.Spacing.xs,
    color: Theme.Colors.textSecondary,
  },
  inputSmall: {
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    borderRadius: 12,
    paddingHorizontal: Theme.Spacing.md,
    paddingVertical: Theme.Spacing.sm,
    fontSize: 14,
    color: Theme.Colors.textPrimary,
    backgroundColor: Theme.Colors.card,
  },
  payChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.Spacing.xs,
  },
  chip: {
    paddingHorizontal: Theme.Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.Colors.background,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  chipOn: {
    backgroundColor: Theme.Colors.primary,
    borderColor: Theme.Colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.Colors.textSecondary,
  },
  chipTextOn: {
    color: Theme.Colors.card,
  },
  totalsBox: {
    marginTop: Theme.Spacing.md,
    padding: Theme.Spacing.lg,
    borderRadius: 16,
    backgroundColor: Theme.Colors.background,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    marginBottom: Theme.Spacing.md,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.Spacing.sm,
  },
  totalLineLabel: {
    fontSize: 16,
    color: Theme.Colors.textSecondary,
    fontWeight: '600',
  },
  totalLineValue: {
    fontSize: 17,
    fontWeight: '800',
    color: Theme.Colors.textPrimary,
  },
  totalGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Theme.Spacing.sm,
    paddingTop: Theme.Spacing.md,
    borderTopWidth: 2,
    borderTopColor: Theme.Colors.border,
  },
  totalGrandLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.Colors.textSecondary,
  },
  totalGrandValue: {
    fontSize: 28,
    fontWeight: '900',
    color: Theme.Colors.primary,
    letterSpacing: -0.3,
  },
  footerBtns: {
    gap: Theme.Spacing.sm,
  },
  row2: {
    flexDirection: 'row',
    gap: Theme.Spacing.sm,
  },
  row3: {
    flexDirection: 'row',
    gap: Theme.Spacing.xs,
    flexWrap: 'wrap',
  },
  chargeBtn: {
    minHeight: 52,
    paddingVertical: Theme.Spacing.md,
  },
  flex1: {
    flex: 1,
  },
  compactNav: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.Colors.border,
    backgroundColor: Theme.Colors.card,
    flexShrink: 0,
  },
});
