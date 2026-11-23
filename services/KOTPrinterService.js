import { Platform } from 'react-native';
import {
  HINDI_TRANSLATIONS,
  getHindiTranslation,
  getCategoryHindi,
} from '../constants/hindiTranslations';

class KOTPrinterService {
  constructor() {
    this.printerWidth = 58; // 58mm thermal printer
    this.charsPerLine = 32; // Characters per line for 58mm printer
    this.connectedPrinter = null;
  }

  // Format text for 58mm printer (center, left, right alignment)
  centerText(text) {
    const padding = Math.floor((this.charsPerLine - text.length) / 2);
    return ' '.repeat(Math.max(0, padding)) + text;
  }

  rightAlignText(text) {
    const padding = this.charsPerLine - text.length;
    return ' '.repeat(Math.max(0, padding)) + text;
  }

  // Create separator line
  createSeparator() {
    return '-'.repeat(this.charsPerLine);
  }

  // Create double separator
  createDoubleSeparator() {
    return '='.repeat(this.charsPerLine);
  }

  // Format KOT ticket in Hindi
  formatKOTTicket(orderData) {
    const {
      orderId,
      tableNumber,
      orderType,
      items,
      waiterName,
      notes,
      date,
      time,
    } = orderData;

    let kotText = '';

    // Header - Restaurant Name (Center)
    kotText += this.centerText('🍽️ THE KILOGRAM') + '\n';
    kotText += this.centerText('किचन ऑर्डर टिकट') + '\n';
    kotText += this.createDoubleSeparator() + '\n\n';

    // Order Information
    kotText += this.createSeparator() + '\n';
    kotText += 'ऑर्डर नं: ' + orderId + '\n';
    kotText += 'दिनांक: ' + date + '\n';
    kotText += 'समय: ' + time + '\n';
    
    if (tableNumber) {
      kotText += 'टेबल: ' + tableNumber + '\n';
    }
    
    if (waiterName) {
      kotText += 'वेटर: ' + waiterName + '\n';
    }

    // Order Type
    const orderTypeHindi = orderType === 'dinein' 
      ? HINDI_TRANSLATIONS.dineInHindi 
      : HINDI_TRANSLATIONS.takeawayHindi;
    kotText += 'प्रकार: ' + orderTypeHindi + '\n';
    kotText += this.createSeparator() + '\n\n';

    // Items List
    kotText += 'आइटम' + ' '.repeat(15) + 'मात्रा' + '\n';
    kotText += this.createSeparator() + '\n';

    items.forEach((item, index) => {
      const hindiName =
        String(item.nameHi || '').trim() ||
        getHindiTranslation(item.name) ||
        String(item.name || '');
      const quantity = item.quantity;
      
      // Item name and quantity
      kotText += `${index + 1}. ${hindiName}\n`;
      kotText += '   मात्रा: ' + quantity + '\n';
      
      if (item.notes) {
        kotText += '   नोट: ' + item.notes + '\n';
      }
      
      kotText += '\n';
    });

    kotText += this.createSeparator() + '\n';

    // Special Notes
    if (notes) {
      kotText += 'विशेष निर्देश:\n';
      kotText += notes + '\n';
      kotText += this.createSeparator() + '\n';
    }

    // Footer
    kotText += '\n';
    kotText += this.centerText('तत्काल तैयार करें') + '\n';
    kotText += this.centerText('धन्यवाद') + '\n';
    kotText += this.createDoubleSeparator() + '\n';
    kotText += '\n\n'; // Extra space for cutting

    return kotText;
  }

  // Format Bill in English
  formatBill(orderData) {
    const {
      orderId,
      tableNumber,
      orderType,
      items,
      subtotal,
      tax,
      discount,
      total,
      date,
      time,
      paymentMethod,
    } = orderData;

    let billText = '';

    // Header
    billText += this.centerText('🍽️ THE KILOGRAM') + '\n';
    billText += this.centerText('Restaurant Bill') + '\n';
    billText += this.createDoubleSeparator() + '\n\n';

    // Order Information
    billText += this.createSeparator() + '\n';
    billText += 'Order No: ' + orderId + '\n';
    billText += 'Date: ' + date + '\n';
    billText += 'Time: ' + time + '\n';
    
    if (tableNumber) {
      billText += 'Table: ' + tableNumber + '\n';
    }
    
    billText += 'Type: ' + (orderType === 'dinein' ? 'Dine In' : 'Takeaway') + '\n';
    billText += this.createSeparator() + '\n\n';

    // Items List
    billText += 'Item' + ' '.repeat(18) + 'Qty  Price\n';
    billText += this.createSeparator() + '\n';

    items.forEach((item) => {
      const name = item.name;
      const quantity = item.quantity;
      const price = item.price;
      const itemTotal = price * quantity;
      
      billText += name + '\n';
      billText += '     ' + quantity + ' x Rs.' + price.toFixed(2) + ' = Rs.' + itemTotal.toFixed(2) + '\n';
      
      if (item.notes) {
        billText += '     Note: ' + item.notes + '\n';
      }
      
      billText += '\n';
    });

    billText += this.createSeparator() + '\n';

    // Totals
    billText += 'Subtotal: Rs.' + subtotal.toFixed(2) + '\n';
    billText += 'Tax (10%): Rs.' + tax.toFixed(2) + '\n';
    
    if (discount > 0) {
      billText += 'Discount: Rs.' + discount.toFixed(2) + '\n';
    }
    
    billText += this.createSeparator() + '\n';
    billText += 'TOTAL: Rs.' + total.toFixed(2) + '\n';
    billText += this.createDoubleSeparator() + '\n';

    // Payment Method
    if (paymentMethod) {
      billText += 'Payment: ' + paymentMethod + '\n';
      billText += this.createSeparator() + '\n';
    }

    // Footer
    billText += '\n';
    billText += this.centerText('Thank you for dining with us!') + '\n';
    billText += this.centerText('Visit again') + '\n';
    billText += this.createDoubleSeparator() + '\n';
    billText += '\n\n';

    return billText;
  }

  // Print KOT (for Bluetooth printer)
  async printKOT(orderData) {
    try {
      const kotText = this.formatKOTTicket(orderData);
      
      if (Platform.OS === 'android') {
        // For Android - use Bluetooth printer library
        // This would require react-native-bluetooth-escpos-printer
        console.log('Printing KOT on Android:', kotText);
        // await BluetoothPrinter.printText(kotText);
      } else if (Platform.OS === 'ios') {
        // For iOS - use AirPrint or Bluetooth printer
        console.log('Printing KOT on iOS:', kotText);
        // await AirPrint.print(kotText);
      }
      
      return { success: true, message: 'KOT printed successfully' };
    } catch (error) {
      console.error('KOT Print Error:', error);
      return { success: false, message: 'Failed to print KOT: ' + error.message };
    }
  }

  // Print Bill (for Bluetooth printer)
  async printBill(orderData) {
    try {
      const billText = this.formatBill(orderData);
      
      if (Platform.OS === 'android') {
        console.log('Printing Bill on Android:', billText);
        // await BluetoothPrinter.printText(billText);
      } else if (Platform.OS === 'ios') {
        console.log('Printing Bill on iOS:', billText);
        // await AirPrint.print(billText);
      }
      
      return { success: true, message: 'Bill printed successfully' };
    } catch (error) {
      console.error('Bill Print Error:', error);
      return { success: false, message: 'Failed to print Bill: ' + error.message };
    }
  }

  // Preview KOT (for testing)
  previewKOT(orderData) {
    return this.formatKOTTicket(orderData);
  }

  // Preview Bill (for testing)
  previewBill(orderData) {
    return this.formatBill(orderData);
  }

  // Connect to Bluetooth printer
  async connectToPrinter(printerAddress) {
    try {
      // This would use react-native-bluetooth-escpos-printer
      // await BluetoothPrinter.connect(printerAddress);
      this.connectedPrinter = printerAddress;
      return { success: true, message: 'Printer connected' };
    } catch (error) {
      console.error('Printer Connection Error:', error);
      return { success: false, message: 'Failed to connect printer' };
    }
  }

  // Disconnect printer
  async disconnectPrinter() {
    try {
      // await BluetoothPrinter.disconnect();
      this.connectedPrinter = null;
      return { success: true, message: 'Printer disconnected' };
    } catch (error) {
      console.error('Printer Disconnect Error:', error);
      return { success: false, message: 'Failed to disconnect printer' };
    }
  }
}

// Export singleton instance
export default new KOTPrinterService();
