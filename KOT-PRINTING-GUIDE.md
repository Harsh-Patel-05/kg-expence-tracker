# KOT (Kitchen Order Ticket) Printing System - Installation Guide

## Web POS — 58mm Bluetooth thermal (Hindi KOT) ✅

The **browser POS** (`index.html`) supports **Hindi KOT on thermal printers** via Chrome:

1. Open the app in **Google Chrome** (Android tablet/phone or desktop with Bluetooth).
2. Pair your **58mm ESC/POS Bluetooth printer** in device Bluetooth settings first (recommended).
3. In **POS Billing**, tap **Connect thermal printer** and select your printer.
4. Add items → **Print KOT (Hindi)** — ticket prints in Devanagari (Hindi names from menu).

**How it works:** Hindi text is drawn as an image and sent to the printer (bitmap). This works on printers that cannot print Hindi as plain text.

**If not connected:** Falls back to normal browser print preview.

**Requirements:** HTTPS or `localhost`, Chrome/Edge, Bluetooth on, printer powered on.

---

## 🎯 Overview (React Native app)
Complete KOT printing system for your React Native POS app with:
- **Hindi KOT tickets** for kitchen staff
- **English bills** for customers
- **58mm thermal printer** support
- **Bluetooth connectivity** for wireless printing

## 📋 Prerequisites

### Required Dependencies
```bash
npm install react-native-bluetooth-escpos-printer
npm install react-native-permissions
```

### For Android
- Android 5.0+ (API 21+)
- Bluetooth permissions
- Location permissions (required for Bluetooth scanning)

### For iOS
- iOS 13.0+
- Bluetooth permissions in Info.plist

## 🔧 Installation Steps

### 1. Install Dependencies

```bash
cd your-project-folder
npm install react-native-bluetooth-escpos-printer react-native-permissions
```

### 2. Android Setup

#### Add permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

#### Update `android/app/build.gradle`:

```gradle
dependencies {
    implementation project(':react-native-bluetooth-escpos-printer')
    implementation project(':react-native-permissions')
}
```

### 3. iOS Setup

#### Add permissions to `ios/YourProject/Info.plist`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app needs Bluetooth access to connect to printers</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>This app needs Bluetooth access to connect to printers</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Location access is required for Bluetooth scanning</string>
```

#### Install pods:

```bash
cd ios
pod install
cd ..
```

## 🚀 Usage Guide

### 1. Connect to Printer

```javascript
import BluetoothPrinterService from '../services/BluetoothPrinterService';

// Scan for printers
const result = await BluetoothPrinterService.scanForPrinters();
if (result.success) {
  console.log('Available printers:', result.printers);
}

// Connect to specific printer
const connectResult = await BluetoothPrinterService.connectToPrinter('00:11:22:33:44:55');
if (connectResult.success) {
  console.log('Printer connected!');
}
```

### 2. Print KOT (Hindi)

```javascript
import KOTPrinterService from '../services/KOTPrinterService';

const kotData = {
  orderId: 'ORD-001',
  tableNumber: 'A5',
  orderType: 'dinein',
  items: [
    { name: 'Classic Burger', quantity: 2, price: 12.99 },
    { name: 'French Fries', quantity: 1, price: 4.99 },
  ],
  waiterName: 'Rajesh',
  notes: 'कम मिर्च (Less spicy)',
  date: '2024-03-31',
  time: '14:30',
};

const result = await KOTPrinterService.printKOT(kotData);
```

### 3. Print Bill (English)

```javascript
const billData = {
  orderId: 'ORD-001',
  tableNumber: 'A5',
  orderType: 'dinein',
  items: [
    { name: 'Classic Burger', quantity: 2, price: 12.99 },
    { name: 'French Fries', quantity: 1, price: 4.99 },
  ],
  subtotal: 30.97,
  tax: 3.10,
  discount: 0,
  total: 34.07,
  date: '2024-03-31',
  time: '14:30',
  paymentMethod: 'Cash',
};

const result = await KOTPrinterService.printBill(billData);
```

## 📱 Printer Compatibility

### Supported Printers (58mm Thermal)
- **POS-5890C** (Most common)
- **POS-5802DD**
- **POS-58**
- **XP-58B**
- **Any ESC/POS compatible 58mm thermal printer**

### Printer Features
- **Width**: 58mm (standard thermal paper)
- **Characters per line**: 32 characters
- **Print speed**: 70-90mm/sec
- **Resolution**: 203 DPI
- **Paper type**: Thermal paper (no ink needed)

## 🎨 KOT Format (Hindi)

### Sample KOT Output:
```
══════════════════════════════════════
        🍽️ THE KILOGRAM
       किचन ऑर्डर टिकट
══════════════════════════════════════
----------------------------------------
ऑर्डर नं: ORD-001
दिनांक: 31/03/2024
समय: 14:30
टेबल: A5
वेटर: राजेश
प्रकार: हॉल में खाना
----------------------------------------

आइटम                मात्रा
----------------------------------------
1. क्लासिक बर्गर
   मात्रा: 2

2. फ्रेंच फ्राइज
   मात्रा: 1
   नोट: कम मिर्च

----------------------------------------
विशेष निर्देश:
कम मिर्च, अतिरिक्त पनीर
----------------------------------------

           तत्काल तैयार करें
               धन्यवाद
══════════════════════════════════════
```

## 📄 Bill Format (English)

### Sample Bill Output:
```
══════════════════════════════════════
        🍽️ THE KILOGRAM
         Restaurant Bill
══════════════════════════════════════
----------------------------------------
Order No: ORD-001
Date: 31/03/2024
Time: 14:30
Table: A5
Type: Dine In
----------------------------------------

Item                     Qty  Price
----------------------------------------
Classic Burger
     2 x Rs.12.99 = Rs.25.98

French Fries
     1 x Rs.4.99 = Rs.4.99
     Note: Less spicy

----------------------------------------
Subtotal: Rs.30.97
Tax (10%): Rs.3.10
----------------------------------------
TOTAL: Rs.34.07
══════════════════════════════════════
Payment: Cash
----------------------------------------

     Thank you for dining with us!
          Visit again
══════════════════════════════════════
```

## 🔧 Troubleshooting

### Printer Not Connecting
1. **Check Bluetooth**: Ensure Bluetooth is enabled on device
2. **Permissions**: Verify all permissions are granted
3. **Printer Power**: Ensure printer is turned on and has paper
4. **Pairing**: Make sure printer is paired with device (Bluetooth settings)

### Hindi Text Not Printing Correctly
1. **Font Support**: Ensure printer supports Unicode/UTF-8
2. **Encoding**: Check printer encoding settings
3. **Font Size**: Hindi text may need larger font size

### Print Quality Issues
1. **Paper Quality**: Use high-quality thermal paper
2. **Print Head**: Clean print head regularly
3. **Battery**: Ensure printer has sufficient battery
4. **Distance**: Stay within Bluetooth range (10m)

## 📝 Customization

### Add More Hindi Translations

Edit `constants/hindiTranslations.js`:

```javascript
export const MENU_ITEM_HINDI = {
  'Classic Burger': 'क्लासिक बर्गर',
  'Your New Item': 'आपका नया आइटम',
};
```

### Adjust Printer Width

Edit `services/KOTPrinterService.js`:

```javascript
constructor() {
  this.printerWidth = 58; // Change to 80 for 80mm printer
  this.charsPerLine = 48; // Adjust characters per line
}
```

### Change KOT Format

Edit `formatKOTTicket` method in `services/KOTPrinterService.js` to customize the layout.

## 🎯 Key Features

✅ **Hindi KOT**: All order details in Hindi for kitchen staff
✅ **English Bill**: Customer bills in English
✅ **58mm Format**: Optimized for standard thermal printers
✅ **Bluetooth**: Wireless printing capability
✅ **Error Handling**: Comprehensive error messages
✅ **Preview**: See KOT before printing
✅ **Custom Notes**: Add special instructions in Hindi

## 📞 Support

For issues or questions:
1. Check printer compatibility
2. Verify Bluetooth permissions
3. Review error messages in console
4. Test with sample data first

## 🚀 Quick Start

```javascript
// 1. Import services
import KOTPrinterService from '../services/KOTPrinterService';
import BluetoothPrinterService from '../services/BluetoothPrinterService';

// 2. Connect to printer
await BluetoothPrinterService.connectToPrinter('printer-address');

// 3. Print KOT
const kotData = { /* your order data */ };
await KOTPrinterService.printKOT(kotData);

// 4. Print Bill
const billData = { /* your bill data */ };
await KOTPrinterService.printBill(billData);
```

---

**Your KOT printing system is now ready!** 🎉
