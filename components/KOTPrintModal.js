import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { Theme } from '../theme';
import Button from './Button';
import KOTPrinterService from '../services/KOTPrinterService';

const KOTPrintModal = ({
  visible,
  onClose,
  orderData,
  onPrintSuccess,
  onPrintError,
}) => {
  const [tableNumber, setTableNumber] = useState(orderData?.tableNumber || '');
  const [waiterName, setWaiterName] = useState(orderData?.waiterName || '');
  const [specialNotes, setSpecialNotes] = useState(orderData?.notes || '');
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewText, setPreviewText] = useState('');

  // Generate KOT preview
  const generateKOTPreview = () => {
    const currentDate = new Date();
    const date = currentDate.toLocaleDateString('en-IN');
    const time = currentDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const kotData = {
      orderId: orderData?.orderId || 'ORD-001',
      tableNumber: tableNumber,
      orderType: orderData?.orderType || 'dinein',
      items: orderData?.items || [],
      waiterName: waiterName,
      notes: specialNotes,
      date: date,
      time: time,
    };

    const preview = KOTPrinterService.previewKOT(kotData);
    setPreviewText(preview);
    return kotData;
  };

  // Handle KOT Print
  const handlePrintKOT = async () => {
    setIsPrinting(true);
    
    try {
      const kotData = generateKOTPreview();
      
      // Print KOT
      const result = await KOTPrinterService.printKOT(kotData);
      
      if (result.success) {
        Alert.alert('Success', 'KOT printed successfully!', [
          { text: 'OK', onPress: () => {
            onPrintSuccess?.(kotData);
            onClose();
          }}
        ]);
      } else {
        Alert.alert('Error', result.message);
        onPrintError?.(result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to print KOT: ' + error.message);
      onPrintError?.(error.message);
    } finally {
      setIsPrinting(false);
    }
  };

  // Handle Bill Print (English)
  const handlePrintBill = async () => {
    setIsPrinting(true);
    
    try {
      const currentDate = new Date();
      const date = currentDate.toLocaleDateString('en-IN');
      const time = currentDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      const billData = {
        orderId: orderData?.orderId || 'ORD-001',
        tableNumber: tableNumber,
        orderType: orderData?.orderType || 'dinein',
        items: orderData?.items || [],
        subtotal: orderData?.subtotal || 0,
        tax: orderData?.tax || 0,
        discount: orderData?.discount || 0,
        total: orderData?.total || 0,
        date: date,
        time: time,
        paymentMethod: orderData?.paymentMethod || 'Cash',
      };

      const result = await KOTPrinterService.printBill(billData);
      
      if (result.success) {
        Alert.alert('Success', 'Bill printed successfully!', [
          { text: 'OK', onPress: () => {
            onPrintSuccess?.(billData);
            onClose();
          }}
        ]);
      } else {
        Alert.alert('Error', result.message);
        onPrintError?.(result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to print Bill: ' + error.message);
      onPrintError?.(error.message);
    } finally {
      setIsPrinting(false);
    }
  };

  // Show preview when modal opens
  React.useEffect(() => {
    if (visible) {
      generateKOTPreview();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Print Order</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Order Details Input */}
            <View style={styles.inputSection}>
              <Text style={styles.sectionTitle}>ऑर्डर विवरण (Order Details)</Text>
              
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>टेबल नं (Table No):</Text>
                <TextInput
                  style={styles.input}
                  value={tableNumber}
                  onChangeText={setTableNumber}
                  placeholder="टेबल नंबर"
                  placeholderTextColor={Theme.Colors.textSecondary}
                />
              </View>

              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>वेटर नाम (Waiter):</Text>
                <TextInput
                  style={styles.input}
                  value={waiterName}
                  onChangeText={setWaiterName}
                  placeholder="वेटर का नाम"
                  placeholderTextColor={Theme.Colors.textSecondary}
                />
              </View>

              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>विशेष नोट (Special Notes):</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={specialNotes}
                  onChangeText={setSpecialNotes}
                  placeholder="विशेष निर्देश (जैसे: कम मिर्च, अतिरिक्त पनीर)"
                  placeholderTextColor={Theme.Colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            {/* KOT Preview */}
            <View style={styles.previewSection}>
              <Text style={styles.sectionTitle}>KOT प्रिव्यू (Preview)</Text>
              <View style={styles.previewBox}>
                <Text style={styles.previewText}>{previewText}</Text>
              </View>
            </View>

            {/* Print Options */}
            <View style={styles.printOptions}>
              <Text style={styles.sectionTitle}>प्रिंट विकल्प (Print Options)</Text>
              
              <Button
                title="🖨️ KOT प्रिंट करें (Print KOT)"
                onPress={handlePrintKOT}
                disabled={isPrinting}
                variant="primary"
                style={styles.printButton}
              />
              
              <Button
                title="📄 बिल प्रिंट करें (Print Bill)"
                onPress={handlePrintBill}
                disabled={isPrinting}
                variant="secondary"
                style={styles.printButton}
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button
              title="रद्द करें (Cancel)"
              onPress={onClose}
              variant="secondary"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Theme.Colors.card,
    borderRadius: 16,
    width: '90%',
    maxHeight: '90%',
    ...Theme.Shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Theme.Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Theme.Colors.border,
  },
  modalTitle: {
    ...Theme.Typography.title,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: Theme.Colors.textSecondary,
  },
  modalBody: {
    flex: 1,
    padding: Theme.Spacing.lg,
  },
  inputSection: {
    marginBottom: Theme.Spacing.lg,
  },
  sectionTitle: {
    ...Theme.Typography.subtitle,
    marginBottom: Theme.Spacing.md,
    color: Theme.Colors.primary,
  },
  inputRow: {
    marginBottom: Theme.Spacing.md,
  },
  inputLabel: {
    ...Theme.Typography.body,
    marginBottom: Theme.Spacing.xs,
    color: Theme.Colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    borderRadius: 8,
    padding: Theme.Spacing.md,
    backgroundColor: Theme.Colors.background,
    ...Theme.Typography.body,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  previewSection: {
    marginBottom: Theme.Spacing.lg,
  },
  previewBox: {
    backgroundColor: Theme.Colors.background,
    padding: Theme.Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.Colors.border,
    minHeight: 200,
  },
  previewText: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: Theme.Colors.textPrimary,
    lineHeight: 14,
  },
  printOptions: {
    marginBottom: Theme.Spacing.lg,
  },
  printButton: {
    marginBottom: Theme.Spacing.sm,
  },
  modalFooter: {
    padding: Theme.Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Theme.Colors.border,
  },
});

export default KOTPrintModal;
