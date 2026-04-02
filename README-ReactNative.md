# Restaurant POS - React Native

A modern, professional Restaurant POS system built with React Native, featuring a clean SaaS design and smooth animations.

## 🚀 Features

- **Modern POS Design**: Clean, minimal SaaS-style interface
- **3-Column Layout**: Sidebar navigation, menu grid, order panel
- **Smooth Animations**: React Native Reanimated for premium feel
- **Responsive Design**: Works on mobile and tablet
- **Real-time Updates**: Instant cart calculations and order management
- **Professional Theme**: Consistent design system with proper spacing

## 📱 Screenshots

[Add screenshots of the app here]

## 🛠 Installation

### Prerequisites

- Node.js 16+
- React Native CLI
- Android Studio (for Android)
- Xcode (for iOS)

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/Vilen7300/kg-expence-tracker.git
cd kg-expence-tracker
```

2. **Install dependencies**
```bash
npm install
# or
yarn install
```

3. **Install pods (iOS only)**
```bash
cd ios
pod install
cd ..
```

4. **Run the app**

For Android:
```bash
npm run android
```

For iOS:
```bash
npm run ios
```

## 🏗 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Button.js
│   ├── QuantityStepper.js
│   ├── SearchBar.js
│   ├── CategoryTabs.js
│   ├── MenuCard.js
│   ├── OrderItem.js
│   └── Sidebar.js
├── screens/            # Main screens
│   └── POSScreen.js
├── theme/              # Design system
│   ├── colors.js
│   ├── spacing.js
│   ├── typography.js
│   ├── shadows.js
│   └── index.js
├── constants/          # App constants
│   ├── menuItems.js
│   └── navigation.js
└── hooks/              # Custom hooks
```

## 🎨 Theme System

The app uses a centralized theme system for consistent styling:

### Colors
```javascript
{
  primary: '#2F855A',
  primaryLight: '#38A169',
  background: '#F7FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#1A202C',
  textSecondary: '#718096',
  accentYellow: '#ECC94B',
}
```

### Spacing
Based on 4pt grid system:
```javascript
{
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
}
```

### Typography
Consistent font sizes and weights:
```javascript
{
  title: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 14, fontWeight: '400' },
  small: { fontSize: 12, fontWeight: '400' },
  price: { fontSize: 14, fontWeight: '700', color: '#2F855A' },
}
```

## 🧩 Components

### Button
Reusable button component with multiple variants:
```javascript
<Button
  title="Proceed Payment"
  variant="accent"
  onPress={handlePayment}
/>
```

### QuantityStepper
Animated quantity selector:
```javascript
<QuantityStepper
  value={quantity}
  onIncrease={() => setQuantity(q + 1)}
  onDecrease={() => setQuantity(q - 1)}
  size="small"
/>
```

### MenuCard
Product card with add functionality:
```javascript
<MenuCard
  item={menuItem}
  quantity={cart[item.id] || 0}
  onAddToCart={handleAddToCart}
  onQuantityChange={handleQuantityChange}
/>
```

## 🎯 Key Features

### 1. **Fast POS Experience**
- Instant item addition with bounce animations
- Real-time cart updates
- Smooth transitions (200ms)
- No delays or heavy navigation

### 2. **Professional Design**
- Soft UI with light background
- Rounded corners (12-16px)
- Smooth shadows
- 8pt grid spacing system
- Premium SaaS feel

### 3. **Responsive Layout**
- **Mobile**: Stacked layout
- **Tablet**: 3-column layout (240px sidebar, flex center, 340px order panel)

### 4. **Micro-interactions**
- Button press: scale animation (0.97)
- Add button: bounce effect
- Smooth transitions
- Premium feel

## 🔧 Customization

### Adding New Menu Items
Edit `constants/menuItems.js`:
```javascript
{
  id: 'unique-id',
  name: 'Item Name',
  description: 'Item description',
  price: 12.99,
  category: 'category-id',
  image: '🍔',
}
```

### Custom Colors
Edit `theme/colors.js`:
```javascript
export const Colors = {
  primary: '#your-color',
  // ... other colors
};
```

### New Components
Follow the existing structure in `components/` folder and use the theme system:
```javascript
import { Theme } from '../theme';

const styles = StyleSheet.create({
  container: {
    backgroundColor: Theme.Colors.background,
    padding: Theme.Spacing.md,
  },
});
```

## 📱 Platform Support

- ✅ iOS (iPhone, iPad)
- ✅ Android (Phones, Tablets)
- ✅ Responsive design
- ✅ Platform-specific shadows

## 🚀 Performance

- Uses `FlatList` for efficient menu rendering
- `React Native Reanimated` for smooth 60fps animations
- Optimized component structure
- Minimal re-renders

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For support, email support@example.com or create an issue on GitHub.

---

Built with ❤️ using React Native
