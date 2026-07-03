#!/usr/bin/env node
/**
 * Build Kilogram takeaway menu seed from data/kg-takeaway-menu-source.js
 * Run: node scripts/build-kilogram-menu.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "data/kg-takeaway-menu-source.js");
const outJs = path.join(root, "constants/kilogramMenuSeed.js");
const outCsv = path.join(root, "data/kilogram-takeaway-menu-full.csv");

const CATEGORY_MAP = {
  snacks_dabeli: "Snacks",
  snacks_vadapav: "Snacks",
  snacks_puff_burger: "Snacks",
  snacks_sandwich: "Snacks",
  snacks_maggi: "Snacks",
  snacks_cafe: "Snacks",
  chinese_soup: "Chinese",
  chinese_manchurian: "Chinese",
  chinese_rice: "Chinese",
  chinese_noodles: "Chinese",
  chinese_paneer: "Chinese",
  chinese_starters: "Chinese",
  bhaji: "Mains",
  pulao: "Mains",
  pau: "Mains",
  combos: "Mains",
  punjabi_veg: "Punjabi",
  punjabi_paneer: "Punjabi",
  punjabi_kaju: "Punjabi",
  punjabi_dal: "Punjabi",
  punjabi_rice: "Punjabi",
  punjabi_roti: "Punjabi",
  beverages: "Beverages",
};

const HI_WORDS = [
  ["Kilogram Special", "किलोग्राम स्पेशल"],
  ["Chinese on Kilo", "किलो पर चाइनीज"],
  ["Bread Butter", "ब्रेड बटर"],
  ["Butter Jam", "बटर जैम"],
  ["Aloo Mutter", "आलू मटर"],
  ["Aloo Tikki", "आलू टिक्की"],
  ["Cheese Chutney", "चीज़ चटनी"],
  ["Cheese Chilli Onion", "चीज़ चिली प्याज"],
  ["Corn Fiesta", "कॉर्न फिएस्टा"],
  ["Veg Coleslaw", "वेज कोलस्लॉ"],
  ["Paneer Tandoori", "पनीर तंदूरी"],
  ["Peri-Peri Paneer", "पेरी पेरी पनीर"],
  ["Chipotle Paneer", "चिपोटले पनीर"],
  ["Makhni Paneer", "मखनी पनीर"],
  ["Pizzeria", "पिज़्ज़ेरिया"],
  ["American Club", "अमेरिकन क्लब"],
  ["Tandoori Paneer Club", "तंदूरी पनीर क्लब"],
  ["Junglee Paneer", "जंगली पनीर"],
  ["Classic Club", "क्लासिक क्लब"],
  ["Paneer Takatak", "पनीर टकाटक"],
  ["Mexican Club", "मैक्सिकन क्लब"],
  ["Three-In-One", "थ्री-इन-वन"],
  ["Masala Maggi", "मसाला मैगी"],
  ["Butter Maggi", "बटर मैगी"],
  ["Veg Maggi", "वेज मैगी"],
  ["Tadka Maggi", "तड़का मैगी"],
  ["Veg Tadka Maggi", "वेज तड़का मैगी"],
  ["Mexican Panini", "मैक्सिकन पनीनी"],
  ["Pizzeria Panini", "पिज़्ज़ेरिया पनीनी"],
  ["Russian Panini", "रशियन पनीनी"],
  ["Regular Bhel", "रेगुलर भेल"],
  ["Sukhi Bhel", "सूखी भेल"],
  ["Jain Bhel", "जैन भेल"],
  ["Masala Fries", "मसाला फ्राइज़"],
  ["Peri-Peri Fries", "पेरी पेरी फ्राइज़"],
  ["Cold Coffee", "कोल्ड कॉफी"],
  ["Chocolate Cold Coffee", "चॉकलेट कोल्ड कॉफी"],
  ["Hot & Sour", "हॉट एंड सॉर"],
  ["Man Chow", "मैन चाउ"],
  ["Sweet Corn", "स्वीट कॉर्न"],
  ["Dry Manchurian", "ड्राई मंचूरियन"],
  ["Gravy Manchurian", "ग्रेवी मंचूरियन"],
  ["Veg Fried Rice", "वेज फ्राइड राइस"],
  ["Schezwan Rice", "सेजवान राइस"],
  ["Manchurian Rice", "मंचूरियन राइस"],
  ["Garlic Rice", "गार्लिक राइस"],
  ["Noodle Rice", "नूडल राइस"],
  ["Paneer Rice", "पनीर राइस"],
  ["Mexican Rice", "मैक्सिकन राइस"],
  ["Triple Fried Rice", "ट्रिपल फ्राइड राइस"],
  ["Hakka Noodles", "हक्का नूडल्स"],
  ["Schezwan Noodles", "सेजवान नूडल्स"],
  ["Manchurian Noodles", "मंचूरियन नूडल्स"],
  ["Garlic Noodles", "गार्लिक नूडल्स"],
  ["Paneer Noodles", "पनीर नूडल्स"],
  ["Paneer Manchurian", "पनीर मंचूरियन"],
  ["Paneer Chilli", "पनीर चिली"],
  ["Paneer Crispy", "पनीर क्रिस्पी"],
  ["Chilli Potato", "चिली आलू"],
  ["Honey Chilli Potato", "हनी चिली आलू"],
  ["Crispy Corn", "क्रिस्पी कॉर्न"],
  ["Chinese Bhel", "चाइनीज भेल"],
  ["Regular Bhaji", "रेगुलर भाजी"],
  ["Swaminarayan Bhaji", "स्वामिनारायण भाजी"],
  ["Bowl Bhaji", "बाउल भाजी"],
  ["Paneer Bhaji", "पनीर भाजी"],
  ["Special Bhaji", "स्पेशल भाजी"],
  ["Regular Pulao", "रेगुलर पुलाव"],
  ["Swaminarayan Pulao", "स्वामिनारायण पुलाव"],
  ["Jain Pulao", "जैन पुलाव"],
  ["Dry Fruit Pulao", "ड्राई फ्रूट पुलाव"],
  ["Kashmiri Pulao", "कश्मीरी पुलाव"],
  ["Special Pulao", "स्पेशल पुलाव"],
  ["Regular Pau", "रेगुलर पाव"],
  ["Oil Pau", "ऑयल पाव"],
  ["Butter Pau", "बटर पाव"],
  ["Lasan Chutney", "लसण चटनी"],
  ["Paneer Tikka Masala", "पनीर टिक्का मसाला"],
  ["Paneer Butter Masala", "पनीर बटर मसाला"],
  ["Paneer Kadai", "पनीर कड़ाही"],
  ["Paneer Tawa Masala", "पनीर तवा मसाला"],
  ["Paneer Rajwadi", "पनीर राजवाड़ी"],
  ["Paneer Kolhapuri", "पनीर कोल्हापुरी"],
  ["Paneer Angara", "पनीर अंगारा"],
  ["Paneer Bhuna Masala", "पनीर भुना मसाला"],
  ["Mutter Paneer", "मटर पनीर"],
  ["Palak Paneer", "पालक पनीर"],
  ["Shahi Paneer", "शाही पनीर"],
  ["Paneer Chatpata", "पनीर चटपटा"],
  ["Paneer Lababdar", "पनीर लबाबदार"],
  ["Paneer Korma", "पनीर कोरमा"],
  ["Malai Kofta", "मलाई कोफ्ता"],
  ["Paneer Toofani", "पनीर तूफानी"],
  ["Paneer Kadhai", "पनीर कढ़ाई"],
  ["Paneer Handi", "पनीर हांडी"],
  ["Kaju Curry", "काजू करी"],
  ["Kaju Masala", "काजू मसाला"],
  ["Kaju Butter Masala", "काजू बटर मसाला"],
  ["Kaju Paneer Masala", "काजू पनीर मसाला"],
  ["Kaju Kofta", "काजू कोफ्ता"],
  ["Khoya Kaju", "खोया काजू"],
  ["Dal Fry", "दाल फ्राई"],
  ["Dal Tadka", "दाल तड़का"],
  ["Dal Tadka Butter", "दाल तड़का बटर"],
  ["Dal Khichdi", "दाल खिचड़ी"],
  ["Plain Rice", "प्लेन राइस"],
  ["Jeera Rice", "जीरा राइस"],
  ["Veg Biryani", "वेज बिरयानी"],
  ["Hyderabadi Biryani", "हैदराबादी बिरयानी"],
  ["Plain Tawa Roti", "प्लेन तवा रोटी"],
  ["Butter Tawa Roti", "बटर तवा रोटी"],
  ["Plain Tandoori Roti", "प्लेन तंदूरी रोटी"],
  ["Butter Tandoori Roti", "बटर तंदूरी रोटी"],
  ["Butter Naan", "बटर नान"],
  ["Butter Paratha", "बटर पराठा"],
  ["Water Bottle", "पानी की बोतल"],
  ["Thums Up", "थम्स अप"],
  ["Regular Dabeli", "रेगुलर दाबेली"],
  ["Butter Dabeli", "बटर दाबेली"],
  ["Cheese Dabeli", "चीज़ दाबेली"],
  ["Cheese Vadapav", "चीज़ वड़ापाव"],
  ["Mayonnaise Vadapav", "मेयोनीज़ वड़ापाव"],
  ["Schezwan Vadapav", "सेजवान वड़ापाव"],
  ["Bombay Vadapav", "बॉम्बे वड़ापाव"],
  ["Regular Puff", "रेगुलर पफ"],
  ["Veg Puff", "वेज पफ"],
  ["Chinese Puff", "चाइनीज पफ"],
  ["Tandoori Puff", "तंदूरी पफ"],
  ["Tadka Puff", "तड़का पफ"],
  ["Cheese Puff", "चीज़ पफ"],
  ["Mayonnaise Puff", "मेयोनीज़ पफ"],
  ["Veg Burger", "वेज बर्गर"],
  ["Tandoori Burger", "तंदूरी बर्गर"],
  ["Schezwan Burger", "सेजवान बर्गर"],
  ["Peri-Peri Burger", "पेरी पेरी बर्गर"],
  ["Chocolate Sandwich", "चॉकलेट सैंडविच"],
  ["Pineapple Sandwich", "पाइनएप्पल सैंडविच"],
  ["Rabdi Sandwich", "रबड़ी सैंडविच"],
  ["Tomato Soup", "टोमैटो सूप"],
  ["Veg Masala", "वेज मसाला"],
  ["Veg Kadai", "वेज कड़ाही"],
  ["Veg Kolhapuri", "वेज कोल्हापुरी"],
  ["Veg Hyderabadi", "वेज हैदराबादी"],
  ["Veg Jaipuri", "वेज जयपुरी"],
  ["Veg Chatpata", "वेज चटपटा"],
  ["Chana Masala", "चना मसाला"],
  ["Veg Korma", "वेज कोरमा"],
  ["Mix Veg", "मिक्स वेज"],
  ["Veg Angara", "वेज अंगारा"],
  ["Aloo Palak", "आलू पालक"],
  ["Dum Aloo", "दम आलू"],
  ["Veg Kofta", "वेज कोफ्ता"],
  ["Veg Handi", "वेज हांडी"],
  ["Paneer", "पनीर"],
  ["Veg", "वेज"],
  ["Sandwich", "सैंडविच"],
  ["Burger", "बर्गर"],
  ["Puff", "पफ"],
  ["Maggi", "मैगी"],
  ["Grill", "ग्रिल"],
  ["Club", "क्लब"],
  ["Dabeli", "दाबेली"],
  ["Vadapav", "वड़ापाव"],
  ["Bhaji", "भाजी"],
  ["Pulao", "पुलाव"],
  ["Pau", "पाव"],
  ["Manchurian", "मंचूरियन"],
  ["Noodles", "नूडल्स"],
  ["Rice", "राइस"],
  ["Soup", "सूप"],
  ["Bhel", "भेल"],
  ["Fries", "फ्राइज़"],
  ["Coffee", "कॉफी"],
  ["Butter", "बटर"],
  ["Cheese", "चीज़"],
  ["Regular", "रेगुलर"],
  ["Special", "स्पेशल"],
  ["Mexican", "मैक्सिकन"],
  ["Schezwan", "सेजवान"],
  ["Tandoori", "तंदूरी"],
  ["Peri-Peri", "पेरी पेरी"],
  ["Gravy", "ग्रेवी"],
  ["Dry", "ड्राई"],
  ["Fried", "फ्राइड"],
  ["Chilli", "चिली"],
  ["Crispy", "क्रिस्पी"],
  ["Masala", "मसाला"],
  ["Oil", "ऑयल"],
  ["Grilled", "ग्रिल्ड"],
  ["Combo", "कॉम्बो"],
  ["Add", "एक्स्ट्रा"],
  ["Fanta", "फैंटा"],
  ["Sprite", "स्प्राइट"],
];

function toHindiName(english) {
  let hi = String(english || "").trim();
  const sorted = [...HI_WORDS].sort((a, b) => b[0].length - a[0].length);
  for (const [en, h] of sorted) {
    hi = hi.split(en).join(h);
  }
  return hi;
}

function itemBaseName(item) {
  return String(item.name || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

function parsePrices(item) {
  const label = item.priceLabel || `₹${item.price}`;
  const prices = [...String(label).matchAll(/₹\s*(\d+)/g)].map((m) => parseInt(m[1], 10));
  if (!prices.length) prices.push(Number(item.price) || 0);
  const unique = [...new Set(prices)].filter((p) => p > 0);
  if (unique.length <= 1) return [{ price: unique[0] || item.price, suffix: "" }];

  const paren = String(label).match(/\(([^)]+)\)\s*$/);
  let parts = paren ? paren[1].split("/").map((s) => s.trim()) : [];
  // e.g. "(Grilled +₹20)" → Regular / Grilled
  if (parts.length === 1 && /grilled/i.test(parts[0]) && unique.length === 2) {
    parts = ["Regular", "Grilled"];
  }
  while (parts.length < unique.length) {
    parts.push(unique.length === 2 && parts.length === 0 ? "Regular" : `Option ${parts.length + 1}`);
  }

  return unique.map((price, i) => ({
    price,
    suffix: parts[i] ? ` (${parts[i]})` : "",
  }));
}

function loadMenuData() {
  const code = fs.readFileSync(sourcePath, "utf8");
  const ctx = { menuData: null };
  vm.runInNewContext(code + "\n;menuData = menuData;", ctx);
  return ctx.menuData;
}

function build() {
  const menuData = loadMenuData();
  const items = [];
  let sortKey = 0;

  for (const [key, list] of Object.entries(menuData)) {
    const category = CATEGORY_MAP[key] || "General";
    for (const item of list) {
      const variants = parsePrices(item);
      for (const v of variants) {
        const name = `${itemBaseName(item)}${v.suffix}`;
        items.push({
          name,
          nameHi: toHindiName(name),
          price: v.price,
          category,
          imageUrl: "",
          available: true,
          sort: sortKey++,
          sourceId: item.id,
        });
      }
    }
  }

  const csvHeader = "name,nameHi,price,category,available\n";
  const csvRows = items
    .map((it) => {
      const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
      return [esc(it.name), esc(it.nameHi), it.price, esc(it.category), "true"].join(",");
    })
    .join("\n");
  fs.writeFileSync(outCsv, csvHeader + csvRows, "utf8");

  const jsBody = `/** Auto-generated from Kilogram website menu — do not edit by hand */\nwindow.KILOGRAM_MENU_SEED = ${JSON.stringify(items, null, 2)};\n\nwindow.POS_MENU_CATEGORIES = [\n  { id: 'all', label: 'All', icon: '🍽️' },\n  { id: '__favs', label: 'Favourites', icon: '⭐' },\n  { id: 'Snacks', label: 'Snacks', icon: '🥙' },\n  { id: 'Chinese', label: 'Chinese', icon: '🥢' },\n  { id: 'Mains', label: 'Mains', icon: '🍛' },\n  { id: 'Punjabi', label: 'Punjabi', icon: '🍲' },\n  { id: 'Beverages', label: 'Beverages', icon: '🥤' },\n];\n`;
  fs.writeFileSync(outJs, jsBody, "utf8");

  console.log(`Wrote ${items.length} items → ${outJs}`);
  console.log(`Wrote CSV → ${outCsv}`);
}

build();
