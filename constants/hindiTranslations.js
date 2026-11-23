// Hindi translations for KOT (Kitchen Order Ticket)
export const HINDI_TRANSLATIONS = {
  // Common KOT terms
  kot: 'किचन ऑर्डर टिकट',
  order: 'ऑर्डर',
  table: 'टेबल',
  dineIn: 'डाइन-इन',
  takeaway: 'टेकअवे',
  quantity: 'मात्रा',
  item: 'आइटम',
  price: 'कीमत',
  total: 'कुल',
  subtotal: 'उप-कुल',
  tax: 'कर',
  discount: 'छूट',
  notes: 'नोट्स',
  date: 'दिनांक',
  time: 'समय',
  waiter: 'वेटर',
  kitchen: 'किचन',
  urgent: 'तत्काल',
  cancel: 'रद्द करें',
  print: 'प्रिंट',
  
  // Menu items translations
  burger: 'बर्गर',
  pizza: 'पिज्जा',
  sandwich: 'सैंडविच',
  beverage: 'पेय पदार्थ',
  dessert: 'मिठाई',
  starter: 'स्टार्टर',
  
  // Specific menu items
  classicBurger: 'क्लासिक बर्गर',
  margheritaPizza: 'मार्गरीटा पिज्जा',
  clubSandwich: 'क्लब सैंडविच',
  cocaCola: 'कोका-कोला',
  chocolateCake: 'चॉकलेट केक',
  frenchFries: 'फ्रेंच फ्राइज',
  
  // Order types
  dineInHindi: 'हॉल में खाना',
  takeawayHindi: 'पैक करवाना',
  
  // Instructions
  prepareImmediately: 'तुरंत तैयार करें',
  specialInstructions: 'विशेष निर्देश',
  noSpicy: 'मिर्च नहीं',
  extraSpicy: 'अतिरिक्त मिर्च',
  lessSalt: 'कम नमक',
  extraCheese: 'अतिरिक्त पनीर',
};

// Menu item translations mapping
export const MENU_ITEM_HINDI = {
  'Classic Burger': 'क्लासिक बर्गर',
  'Margherita Pizza': 'मार्गरीटा पिज्जा',
  'Club Sandwich': 'क्लब सैंडविच',
  'Coca Cola': 'कोका-कोला',
  'Chocolate Cake': 'चॉकलेट केक',
  'French Fries': 'फ्रेंच फ्राइज',
};

// Helper function to get Hindi translation
export const getHindiTranslation = (englishText) => {
  return MENU_ITEM_HINDI[englishText] || englishText;
};

// Helper function to translate category
export const getCategoryHindi = (category) => {
  const categoryMap = {
    'burger': 'बर्गर',
    'pizza': 'पिज्जा',
    'sandwich': 'सैंडविच',
    'beverage': 'पेय पदार्थ',
    'dessert': 'मिठाई',
    'starter': 'स्टार्टर',
    Snacks: 'स्नैक्स',
    Chinese: 'चाइनीज',
    Mains: 'मेन कोर्स',
    Punjabi: 'पंजाबी',
    Beverages: 'पेय',
  };
  return categoryMap[category] || category;
};
