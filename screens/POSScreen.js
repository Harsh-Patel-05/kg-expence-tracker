import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { Theme } from '../theme';
import Sidebar from '../components/Sidebar';
import SearchBar from '../components/SearchBar';
import CategoryTabs from '../components/CategoryTabs';
import MenuCard from '../components/MenuCard';
import OrderItem from '../components/OrderItem';
import Button from '../components/Button';
import KOTPrintModal from '../components/KOTPrintModal';
import { SAMPLE_MENU_ITEMS } from '../constants/menuItems';

const POSScreen = () => {
  const [activeNavItem, setActiveNavItem] = useState('menu');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState({});
  const [orderType, setOrderType] = useState('dinein'); // dinein or takeaway
  const [promoCode, setPromoCode] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [orderId, setOrderId] = useState('ORD-001');

  // Filter menu items based on category and search
  const filteredMenuItems = useMemo(() => {
    return SAMPLE_MENU_ITEMS.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Calculate order totals
  const orderTotals = useMemo(() => {
    const subtotal = Object.entries(cart).reduce((total, [itemId, quantity]) => {
      const item = SAMPLE_MENU_ITEMS.find(i => i.id === itemId);
      return total + (item ? item.price * quantity : 0);
    }, 0);
    
    const tax = subtotal * 0.1; // 10% tax
    const discount = promoCode === 'SAVE10' ? subtotal * 0.1 : 0;
    const total = subtotal + tax - discount;
    
    return { subtotal, tax, discount, total };
  }, [cart, promoCode]);

  const handleAddToCart = (item) => {
    setCart(prev => ({
      ...prev,
      [item.id]: (prev[item.id] || 0) + 1,
    }));
  };

  const handleQuantityChange = (itemId, quantity) => {
    if (quantity <= 0) {
      const newCart = { ...cart };
      delete newCart[itemId];
      setCart(newCart);
    } else {
      setCart(prev => ({
        ...prev,
        [itemId]: quantity,
      }));
    }
  };

  const handleRemoveFromCart = (itemId) => {
    const newCart = { ...cart };
    delete newCart[itemId];
    setCart(newCart);
  };

  const handlePrintOrder = () => {
    if (Object.keys(cart).length === 0) {
      alert('कृपया पहले आइटम जोड़ें (Please add items first)');
      return;
    }
    setShowPrintModal(true);
  };

  const handlePrintSuccess = (printedOrder) => {
    // Generate new order ID after successful print
    const newOrderId = 'ORD-' + String(parseInt(orderId.split('-')[1]) + 1).padStart(3, '0');
    setOrderId(newOrderId);
    setCart({});
    setPromoCode('');
  };

  const handlePrintError = (error) => {
    console.error('Print error:', error);
  };

  const renderMenuGrid = () => (
    <View style={styles.menuSection}>
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search menu..."
      />
      
      <CategoryTabs
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />
      
      <FlatList
        data={filteredMenuItems}
        renderItem={({ item }) => (
          <MenuCard
            item={item}
            quantity={cart[item.id] || 0}
            onAddToCart={handleAddToCart}
            onQuantityChange={handleQuantityChange}
          />
        )}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.menuGrid}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );

  const renderOrderPanel = () => (
    <View style={styles.orderPanel}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderTitle}>Order Details</Text>
      </View>
      
      <View style={styles.orderTypeTabs}>
        <TouchableOpacity
          style={[
            styles.orderTypeTab,
            orderType === 'dinein' && styles.orderTypeTabActive,
          ]}
          onPress={() => setOrderType('dinein')}
        >
          <Text style={[
            styles.orderTypeText,
            orderType === 'dinein' && styles.orderTypeTextActive,
          ]}>
            Dine In
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.orderTypeTab,
            orderType === 'takeaway' && styles.orderTypeTabActive,
          ]}
          onPress={() => setOrderType('takeaway')}
        >
          <Text style={[
            styles.orderTypeText,
            orderType === 'takeaway' && styles.orderTypeTextActive,
          ]}>
            Takeaway
          </Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.orderItems} showsVerticalScrollIndicator={false}>
        {Object.entries(cart).map(([itemId, quantity]) => {
          const item = SAMPLE_MENU_ITEMS.find(i => i.id === itemId);
          if (!item) return null;
          
          return (
            <OrderItem
              key={itemId}
              item={{ ...item, quantity }}
              onQuantityChange={handleQuantityChange}
              onRemove={handleRemoveFromCart}
            />
          );
        })}
        
        {Object.keys(cart).length === 0 && (
          <View style={styles.emptyCart}>
            <Text style={styles.emptyCartText}>No items added yet</Text>
          </View>
        )}
      </ScrollView>
      
      <View style={styles.orderSummary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>${orderTotals.subtotal.toFixed(2)}</Text>
        </View>
        
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tax (10%)</Text>
          <Text style={styles.summaryValue}>${orderTotals.tax.toFixed(2)}</Text>
        </View>
        
        {orderTotals.discount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Discount</Text>
            <Text style={styles.summaryValue}>-${orderTotals.discount.toFixed(2)}</Text>
          </View>
        )}
        
        <View style={[styles.summaryRow, styles.summaryRowTotal]}>
          <Text style={styles.summaryLabelTotal}>Total</Text>
          <Text style={styles.summaryValueTotal}>${orderTotals.total.toFixed(2)}</Text>
        </View>
      </View>
      
      <View style={styles.promoSection}>
        <View style={styles.promoInputContainer}>
          <TextInput
            style={styles.promoInput}
            value={promoCode}
            onChangeText={setPromoCode}
            placeholder="Promo code"
            placeholderTextColor={Theme.Colors.textSecondary}
          />
          <Button
            title="Apply"
            variant="secondary"
            size="small"
            onPress={() => {}} // Handle promo apply
          />
        </View>
      </View>
      
      <View style={styles.orderActions}>
        <Button
          title="🖨️ Print KOT"
          variant="secondary"
          style={styles.printButton}
          onPress={handlePrintOrder}
        />
        <Button
          title="Hold"
          variant="secondary"
          style={styles.holdButton}
          onPress={() => {}} // Handle hold order
        />
        <Button
          title="Proceed Payment"
          variant="accent"
          style={styles.paymentButton}
          onPress={() => {}} // Handle payment
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.mainLayout}>
          <Sidebar
            activeItem={activeNavItem}
            onItemPress={setActiveNavItem}
          />
          
          {renderMenuGrid()}
          
          {renderOrderPanel()}
        </View>
      </KeyboardAvoidingView>

      <KOTPrintModal
        visible={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        orderData={{
          orderId: orderId,
          orderType: orderType,
          items: Object.entries(cart).map(([itemId, quantity]) => {
            const item = SAMPLE_MENU_ITEMS.find(i => i.id === itemId);
            return item ? { ...item, quantity } : null;
          }).filter(Boolean),
          subtotal: orderTotals.subtotal,
          tax: orderTotals.tax,
          discount: orderTotals.discount,
          total: orderTotals.total,
        }}
        onPrintSuccess={handlePrintSuccess}
        onPrintError={handlePrintError}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.Colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  menuSection: {
    flex: 1,
    padding: Theme.Spacing.lg,
  },
  menuGrid: {
    gap: Theme.Spacing.sm,
  },
  orderPanel: {
    width: 340,
    backgroundColor: Theme.Colors.card,
    borderLeftWidth: 1,
    borderLeftColor: Theme.Colors.border,
    flexDirection: 'column',
  },
  orderHeader: {
    padding: Theme.Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Theme.Colors.border,
  },
  orderTitle: {
    ...Theme.Typography.title,
  },
  orderTypeTabs: {
    flexDirection: 'row',
    padding: Theme.Spacing.md,
    gap: Theme.Spacing.sm,
  },
  orderTypeTab: {
    flex: 1,
    paddingVertical: Theme.Spacing.sm,
    borderRadius: 8,
    backgroundColor: Theme.Colors.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.Colors.border,
  },
  orderTypeTabActive: {
    backgroundColor: Theme.Colors.accentYellowLight,
    borderColor: Theme.Colors.accentYellow,
  },
  orderTypeText: {
    ...Theme.Typography.body,
    color: Theme.Colors.textSecondary,
    fontWeight: '500',
  },
  orderTypeTextActive: {
    color: Theme.Colors.textPrimary,
    fontWeight: '600',
  },
  orderItems: {
    flex: 1,
    paddingVertical: Theme.Spacing.md,
  },
  emptyCart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Theme.Spacing.xxl,
  },
  emptyCartText: {
    ...Theme.Typography.small,
    color: Theme.Colors.textSecondary,
  },
  orderSummary: {
    padding: Theme.Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Theme.Colors.border,
    backgroundColor: Theme.Colors.background,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Theme.Spacing.xs,
  },
  summaryRowTotal: {
    borderTopWidth: 1,
    borderTopColor: Theme.Colors.border,
    paddingTop: Theme.Spacing.sm,
    marginTop: Theme.Spacing.sm,
  },
  summaryLabel: {
    ...Theme.Typography.body,
    color: Theme.Colors.textSecondary,
  },
  summaryValue: {
    ...Theme.Typography.body,
    color: Theme.Colors.textPrimary,
    fontWeight: '500',
  },
  summaryLabelTotal: {
    ...Theme.Typography.subtitle,
    color: Theme.Colors.textPrimary,
  },
  summaryValueTotal: {
    ...Theme.Typography.priceLarge,
  },
  promoSection: {
    padding: Theme.Spacing.lg,
    paddingTop: Theme.Spacing.md,
  },
  promoInputContainer: {
    flexDirection: 'row',
    gap: Theme.Spacing.sm,
  },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    borderRadius: 8,
    paddingHorizontal: Theme.Spacing.md,
    paddingVertical: Theme.Spacing.sm,
    backgroundColor: Theme.Colors.card,
    ...Theme.Typography.body,
  },
  orderActions: {
    padding: Theme.Spacing.lg,
    gap: Theme.Spacing.sm,
  },
  printButton: {
    flex: 1,
  },
  holdButton: {
    flex: 1,
  },
  paymentButton: {
    flex: 1,
  },
});

export default POSScreen;
