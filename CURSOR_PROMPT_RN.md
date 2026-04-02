# React Native POS Development Prompt

## Master Cursor Prompt (React Native Specific)

Create a modern Restaurant POS UI in React Native using a clean, minimal SaaS design.

Tech Stack:
- React Native (CLI or Expo)
- Use functional components + hooks
- Styling: StyleSheet (or Tailwind NativeWind if available)
- Use FlatList for performance
- Use React Native Reanimated for smooth animations

Layout:
- Build a 3-column layout using Flexbox
- Left Sidebar (fixed width: 240)
- Center Menu Grid (flex: 1)
- Right Order Panel (fixed width: 340)

Design Style:
- Soft UI with light background (#F7FAFC)
- Rounded corners (12-16)
- Smooth shadows
- Clean spacing (8pt grid system)
- Premium SaaS feel (like modern POS systems)

Theme Requirements:
- Create centralized theme files and reuse everywhere
- Use consistent colors, spacing, typography
- Follow the theme in `mobile/src/theme/` (Expo app entry: `mobile/App.tsx`)

Colors:
primary: #2F855A
primaryLight: #38A169
background: #F7FAFC
card: #FFFFFF
border: #E2E8F0
textPrimary: #1A202C
textSecondary: #718096
accentYellow: #ECC94B

Typography:
- Font: System default (Inter if available)
- Title: 16–18 semi-bold
- Body: 14 regular
- Small: 12
- Price: bold, green (#2F855A)

Spacing:
- xs: 4
- sm: 8
- md: 12
- lg: 16
- xl: 24

Components to Create:
1. Sidebar - Vertical menu with icons, active item has light yellow background
2. MenuCard - Product cards with image, title, description, price, floating "+" button
3. CategoryTabs - Horizontal scrollable category tabs
4. SearchBar - Rounded search bar with icon
5. OrderItem - Order items with quantity stepper (+/-)
6. QuantityStepper - Animated quantity selector
7. Button - Reusable button with variants (primary, secondary, accent)

Key Features:
- Add Item: Tap "+" → item adds instantly with scale/bounce animation
- Quantity: +/- updates live total instantly
- Order Panel: Always visible (sticky feel)
- Fast UX: No delays, no heavy navigation

Micro-interactions:
- Card press: transform: [{ scale: pressed ? 0.97 : 1 }]
- Add button: useSharedValue + withSpring() for bounce effect
- Buttons: opacity feedback (0.7)
- Smooth transitions (200ms)

Shadows:
- iOS: shadowColor: #000, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }
- Android: elevation: 3

Responsive:
- Tablet: show 3 columns layout
- Mobile: stack layout

Code Structure:
- components/ (reusable UI components)
- screens/ (main screens)
- theme/ (colors, spacing, typography, shadows)
- constants/ (menu items, navigation)
- hooks/ (custom hooks)

IMPORTANT DESIGN RULES:
- Keep spacing consistent (use theme.Spacing)
- Avoid clutter
- Use breathing space
- Align everything perfectly
- Use soft shadows, not heavy
- Maintain premium SaaS feel
- Use FlatList for performance
- Use React Native Reanimated for animations
- Follow the existing component patterns

## Quick Start Commands:

1. **Install dependencies:**
```bash
npm install react-native-reanimated react-native-vector-icons
```

2. **For iOS:**
```bash
cd ios && pod install && cd ..
```

3. **Run app:**
```bash
npm run android  # or npm run ios
```

## Component Examples:

### Button Component:
```javascript
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Theme } from '../theme';

const Button = ({ title, onPress, variant = 'primary', style }) => {
  return (
    <TouchableOpacity
      style={[styles.button, styles[variant], style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.text, styles[`${variant}Text`]]}>{title}</Text>
    </TouchableOpacity>
  );
};
```

### Menu Card with Animation:
```javascript
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const MenuCard = ({ item, onAddToCart }) => {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));
  
  const handlePress = () => {
    scale.value = withSpring(0.97, {}, () => {
      scale.value = withSpring(1);
    });
    onAddToCart(item);
  };
  
  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      {/* Card content */}
    </Animated.View>
  );
};
```

## Performance Tips:
- Use FlatList for menu items
- Use React.memo for components
- Optimize re-renders
- Use Reanimated for smooth animations
- Avoid inline functions in render

## Testing:
- Test on both iOS and Android
- Check responsive behavior
- Verify animations are smooth (60fps)
- Test edge cases (empty cart, etc.)

Focus on creating reusable components, clean UI, and smooth interactions that feel like a real POS system.
