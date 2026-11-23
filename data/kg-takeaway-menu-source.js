/**
 * Takeaway menu — synced from Kilogram Takeaway Menu PDF (new images/).
 * Phase 2 cart code expects global menuData.
 */
var menuData = {
  snacks_dabeli: [
    { id: 1, name: 'Regular Dabeli', price: 30, image: 'new images/dabeli.png', description: 'Classic Kutchi dabeli, spiced potato in ladi pav.' },
    { id: 2, name: 'Butter Dabeli', price: 40, image: 'new images/dabeli.png', description: 'Dabeli with extra butter for a richer bite.' },
    { id: 3, name: 'Cheese Dabeli', price: 60, image: 'new images/dabeli.png', description: 'Dabeli loaded with melted cheese.' }
  ],
  snacks_vadapav: [
    { id: 4, name: 'Vadapav (Oil / Butter)', price: 30, priceLabel: '₹30 / ₹40 (Oil / Butter)', image: 'new images/new vadapau.png', description: 'Mumbai-style vada in pav — choose oil-fried or butter-toasted pav.' },
    { id: 5, name: 'Cheese Vadapav', price: 60, image: 'new images/cheese vadapau new.png', description: 'Crispy vada with generous cheese.' },
    { id: 6, name: 'Mayonnaise Vadapav', price: 50, image: 'new images/new vadapau.png', description: 'Vadapav drizzled with creamy mayo.' },
    { id: 7, name: 'Schezwan Vadapav', price: 50, image: 'new images/new vadapau.png', description: 'Spicy Schezwan twist on the classic vada.' },
    { id: 8, name: 'Bombay Vadapav', price: 20, image: 'new images/new vadapau.png', description: 'Street-style Bombay vadapav.' }
  ],
  snacks_puff_burger: [
    { id: 9, name: 'Regular Puff', price: 30, image: 'new images/reg puff.jpeg', description: 'Flaky bakery-style puff.' },
    { id: 10, name: 'Veg Puff', price: 40, image: 'new images/veg puff.jpeg', description: 'Puff with spiced vegetable filling.' },
    { id: 11, name: 'Chinese Puff', price: 30, image: 'new images/sezwan fried rice.png', description: 'Indo-Chinese flavoured veg puff.' },
    { id: 12, name: 'Tandoori Puff', price: 50, image: 'new images/tandoorie.png', description: 'Smoky tandoori-spiced filling.' },
    { id: 13, name: 'Tadka Puff', price: 60, image: 'new images/aloo muter grill.png', description: 'Tempered spices in a crisp puff.' },
    { id: 14, name: 'Cheese Puff', price: 60, image: 'new images/cheese puff.png', description: 'Cheesy baked puff.' },
    { id: 15, name: 'Mayonnaise Puff', price: 40, image: 'new images/mayoniese puff.jpeg', description: 'Puff with mayo filling.' },
    { id: 16, name: 'Aloo Tikki Burger', price: 50, image: 'new images/aloo tikiig.png', description: 'Crispy potato patty with fresh toppings.' },
    { id: 17, name: 'Veg Burger', price: 60, image: 'new images/aloo tikiig.png', description: 'Classic veg patty burger.' },
    { id: 18, name: 'Tandoori Burger', price: 70, image: 'new images/aloo tikiig.png', description: 'Tandoori-spiced veg burger.' },
    { id: 19, name: 'Schezwan Burger', price: 70, image: 'new images/aloo tikiig.png', description: 'Bold Schezwan sauce and crunch.' },
    { id: 20, name: 'Peri-Peri Burger', price: 70, image: 'new images/aloo tikiig.png', description: 'Smoky peri-peri spice.' },
    { id: 21, name: 'Kilogram Special Burger', price: 90, image: 'new images/aloo tikiig.png', description: 'House special loaded burger.' }
  ],
  snacks_sandwich: [
    { id: 22, name: 'Bread Butter Sandwich', price: 50, priceLabel: '₹50 / ₹70 (Grilled +₹20)', image: 'new images/bread butter.png', description: 'Simple bread butter; grilled option available.' },
    { id: 23, name: 'Butter Jam Sandwich', price: 70, priceLabel: '₹70 / ₹90 (Grilled +₹20)', image: 'new images/butter jam.png', description: 'Sweet butter and jam; grilled optional.' },
    { id: 24, name: 'Veg Sandwich', price: 60, priceLabel: '₹60 / ₹80 (Grilled +₹20)', image: 'new images/veg .png', description: 'Fresh veg stuffing; grilled optional.' },
    { id: 25, name: 'Aloo Mutter Sandwich', price: 60, priceLabel: '₹60 / ₹80 (Grilled +₹20)', image: 'new images/aloo muter grill.png', description: 'Potato and pea filling; grilled optional.' },
    { id: 26, name: 'Cheese Sandwich', price: 80, priceLabel: '₹80 / ₹100 (Grilled +₹20)', image: 'new images/cheese.png', description: 'Melted cheese sandwich; grilled optional.' },
    { id: 27, name: 'Cheese Chutney Sandwich', price: 90, priceLabel: '₹90 / ₹110 (Grilled +₹20)', image: 'new images/cheese.png', description: 'Cheese with tangy chutney; grilled optional.' },
    { id: 28, name: 'Chocolate Sandwich', price: 80, image: 'new images/choicolate.png', description: 'Sweet chocolate filling.' },
    { id: 29, name: 'Pineapple Sandwich', price: 100, image: 'new images/butter jam.png', description: 'Tropical pineapple sandwich.' },
    { id: 30, name: 'Rabdi Sandwich', price: 80, image: 'new images/choicolate.png', description: 'Rich rabdi-stuffed sweet sandwich.' },
    { id: 31, name: 'Cheese Chilli Onion Grill', price: 120, image: 'new images/wmremove-transformed.png', description: 'Grilled with cheese, chilli and onion.' },
    { id: 32, name: 'Corn Fiesta Grill', price: 120, image: 'new images/wmremove-transformed (1).png', description: 'Sweet corn and cheese grill.' },
    { id: 33, name: 'Mexican Grill Sandwich', price: 120, image: 'new images/maxican.png', description: 'Mexican-style veg and salsa notes.' },
    { id: 34, name: 'Veg Coleslaw Grill', price: 130, image: 'new images/wmremove-transformed (2).png', description: 'Creamy coleslaw grill sandwich.' },
    { id: 35, name: 'Paneer Tandoori Grill', price: 130, image: 'new images/tandoorie.png', description: 'Tandoori paneer with melted cheese.' },
    { id: 36, name: 'Peri-Peri Paneer Grill', price: 130, image: 'new images/periperi.png', description: 'Paneer with peri-peri kick.' },
    { id: 37, name: 'Chipotle Paneer Grill', price: 140, image: 'new images/paneer chilli dry.png', description: 'Smoky chipotle-style paneer grill.' },
    { id: 38, name: 'Makhni Paneer Grill', price: 140, image: 'new images/paneer chillie gravy.png', description: 'Buttery makhni-style paneer.' },
    { id: 39, name: 'Pizzeria Grill Sandwich', price: 140, image: 'new images/tripple.png', description: 'Pizza-inspired grilled sandwich.' },
    { id: 40, name: 'American Club Sandwich', price: 180, image: 'new images/new one .png', description: 'Triple-decker club with veg and cheese.' },
    { id: 41, name: 'Tandoori Paneer Club', price: 180, image: 'new images/tandoorie.png', description: 'Tandoori paneer layers in a club.' },
    { id: 42, name: 'Junglee Paneer Club', price: 200, image: 'new images/paneer manchurinad gravy.png', description: 'Loaded paneer club sandwich.' },
    { id: 43, name: 'Classic Club Sandwich', price: 160, image: 'new images/veg burger.png', description: 'Classic three-layer club.' },
    { id: 44, name: 'Paneer Takatak Sandwich', price: 180, image: 'new images/paneer chilli dry.png', description: 'Spiced paneer takatak style.' },
    { id: 45, name: 'Mexican Club Sandwich', price: 190, image: 'new images/maxican.png', description: 'Mexican flavours in a tall club.' },
    { id: 46, name: 'Three-In-One Sandwich', price: 190, image: 'new images/tripple.png', description: 'Three fillings in one epic sandwich.' }
  ],
  snacks_maggi: [
    { id: 50, name: 'Masala Maggi', price: 55, image: 'new images/meggie.png', description: 'Classic masala Maggi noodles.' },
    { id: 51, name: 'Butter Maggi', price: 60, image: 'new images/meggie.png', description: 'Maggi tossed in butter.' },
    { id: 52, name: 'Veg Maggi', price: 70, image: 'new images/meggie.png', description: 'Maggi with mixed vegetables.' },
    { id: 53, name: 'Tadka Maggi', price: 80, image: 'new images/meggie.png', description: 'Tempered spice Maggi.' },
    { id: 54, name: 'Veg Tadka Maggi', price: 90, image: 'new images/meggie.png', description: 'Veg Maggi with extra tadka.' }
  ],
  snacks_cafe: [
    { id: 47, name: 'Mexican Panini', price: 140, image: 'new images/maxican.png', description: 'Pressed Mexican-style panini.' },
    { id: 48, name: 'Pizzeria Panini', price: 160, image: 'new images/wmremove-transformed.png', description: 'Cheesy pizza-flavour panini.' },
    { id: 49, name: 'Russian Panini', price: 170, image: 'new images/wmremove-transformed (2).png', description: 'House Russian-style panini.' },
    { id: 55, name: 'Regular Bhel', price: 60, image: 'new images/Gemini_Generated_Image_l6ov0hl6ov0hl6ov.png', description: 'Classic wet bhel with chutneys.' },
    { id: 56, name: 'Sukhi Bhel', price: 50, image: 'new images/Firefly_GeminiFlash_Ultra-realistic professional studio food photography of a Pure Jain Bhel served in a  681736.png', description: 'Dry bhel mix, tangy and crisp.' },
    { id: 57, name: 'Jain Bhel', price: 60, image: 'new images/Firefly_GeminiFlash_Ultra-realistic professional studio food photography of a Pure Jain Bhel served in a  681736.png', description: 'No onion/garlic Jain-style bhel.' },
    { id: 58, name: 'Masala Fries', price: 60, image: 'new images/wmremove-transformed (1).png', description: 'Fries tossed in masala.' },
    { id: 59, name: 'Peri-Peri Fries', price: 90, image: 'new images/periperi.png', description: 'Peri-peri seasoned fries.' },
    { id: 60, name: 'Cold Coffee', price: 110, image: 'new images/Gemini_Generated_Image_whwnclwhwnclwhwn.png', description: 'Chilled coffee.' },
    { id: 61, name: 'Chocolate Cold Coffee', price: 130, image: 'new images/choicolate.png', description: 'Cold coffee with chocolate.' }
  ],
  chinese_soup: [
    { id: 62, name: 'Hot & Sour Soup', price: 80, image: 'new images/Firefly_Gemini Flash_Ultra-realistic professional studio food photography of a classic Indo-Chinese Mancho 681736.png', description: 'Indo-Chinese hot & sour soup.' },
    { id: 63, name: 'Man Chow Soup', price: 80, image: 'new images/Firefly_Gemini Flash_Ultra-realistic professional studio food photography of a classic Indo-Chinese Mancho 681736.png', description: 'Crispy noodle–topped man chow.' },
    { id: 64, name: 'Tomato Soup', price: 80, image: 'new images/Firefly_Gemini Flash_Ultra-realistic professional studio food photography of a classic Tomato Soup served  681736.png', description: 'Comforting tomato soup.' },
    { id: 65, name: 'Sweet Corn Soup', price: 100, image: 'new images/Firefly_Gemini Flash_Ultra-realistic professional studio food photography of a classic Sweet Corn Soup ser 681736.png', description: 'Creamy sweet corn soup.' }
  ],
  chinese_manchurian: [
    { id: 66, name: 'Dry Manchurian', price: 120, image: 'new images/wmremove-transformed.png', description: 'Crispy veg balls — dry style.' },
    { id: 67, name: 'Gravy Manchurian', price: 120, image: 'new images/paneer manchurinad gravy.png', description: 'Manchurian in Indo-Chinese gravy.' },
    { id: 92, name: 'Manchurian Dry — Chinese on Kilo', price: 120, priceLabel: '₹120 / ₹230 (500 g / 1 kg)', image: 'new images/wmremove-transformed.png', description: 'Bulk Manchurian dry by weight.' }
  ],
  chinese_rice: [
    { id: 70, name: 'Veg Fried Rice', price: 120, image: 'new images/garlic rice.png', description: 'Wok-tossed veg fried rice.' },
    { id: 71, name: 'Schezwan Rice', price: 120, image: 'new images/sezwan fried rice.png', description: 'Fiery Schezwan fried rice.' },
    { id: 72, name: 'Manchurian Rice', price: 120, image: 'new images/manchurin rice.jpeg', description: 'Fried rice with Manchurian.' },
    { id: 73, name: 'Garlic Rice', price: 120, image: 'new images/garlic rice.png', description: 'Aromatic garlic fried rice.' },
    { id: 74, name: 'Noodle Rice', price: 120, image: 'new images/noodles rice.jpeg', description: 'Rice with noodle bits — house style.' },
    { id: 75, name: 'Paneer Rice', price: 150, image: 'new images/paneer rice.jpeg', description: 'Fried rice with paneer.' },
    { id: 76, name: 'Mexican Rice', price: 150, image: 'new images/maxican.png', description: 'Mexican-spiced veg rice.' },
    { id: 77, name: 'Triple Fried Rice', price: 200, image: 'new images/tripple.png', description: 'Loaded triple-style fried rice.' },
    { id: 78, name: 'Kilogram Special Rice', price: 200, image: 'new images/new one .png', description: 'Chef\'s special fried rice.' },
    { id: 93, name: 'Manchurian Fried Rice — Chinese on Kilo', price: 120, priceLabel: '₹120 / ₹230 (500 g / 1 kg)', image: 'new images/manchurin rice.jpeg', description: 'Bulk Manchurian fried rice.' },
    { id: 94, name: 'Veg Fried Rice — Chinese on Kilo', price: 130, priceLabel: '₹130 / ₹250 (500 g / 1 kg)', image: 'new images/garlic rice.png', description: 'Bulk veg fried rice.' }
  ],
  chinese_noodles: [
    { id: 79, name: 'Hakka Noodles', price: 120, image: 'new images/chowmin.png', description: 'Classic Hakka noodles.' },
    { id: 80, name: 'Schezwan Noodles', price: 120, image: 'new images/sezwan noodles.png', description: 'Spicy Schezwan noodles.' },
    { id: 81, name: 'Chowmein', price: 120, image: 'new images/chowmin.png', description: 'Street-style chowmein.' },
    { id: 82, name: 'Manchurian Noodles', price: 120, image: 'new images/man noodles.png', description: 'Noodles with Manchurian.' },
    { id: 83, name: 'Garlic Noodles', price: 120, image: 'new images/garlic noodles.png', description: 'Garlic-forward noodles.' },
    { id: 84, name: 'Paneer Noodles', price: 150, image: 'new images/paneer noodles.png', description: 'Noodles with paneer.' },
    { id: 95, name: 'Hakka Noodles — Chinese on Kilo', price: 150, priceLabel: '₹150 / ₹270 (500 g / 1 kg)', image: 'new images/chowmin.png', description: 'Bulk Hakka noodles.' }
  ],
  chinese_paneer: [
    { id: 68, name: 'Paneer Manchurian Dry', price: 150, image: 'new images/paneer chilli dry.png', description: 'Paneer Manchurian — dry.' },
    { id: 69, name: 'Paneer Manchurian Gravy', price: 150, image: 'new images/paneer chillie gravy.png', description: 'Paneer Manchurian in gravy.' },
    { id: 85, name: 'Paneer Chilli Dry', price: 170, image: 'new images/paneer chilli dry.png', description: 'Crispy chilli paneer — dry.' },
    { id: 86, name: 'Paneer Chilli Gravy', price: 170, image: 'new images/paneer chillie gravy.png', description: 'Chilli paneer in gravy.' },
    { id: 87, name: 'Paneer Crispy', price: 170, image: 'new images/paneer chilli dry.png', description: 'Golden crispy paneer bites.' }
  ],
  chinese_starters: [
    { id: 88, name: 'Chilli Potato', price: 150, image: 'new images/wmremove-transformed.png', description: 'Spicy potato fingers.' },
    { id: 89, name: 'Honey Chilli Potato', price: 160, image: 'new images/wmremove-transformed (2).png', description: 'Sweet and spicy potato.' },
    { id: 90, name: 'Crispy Corn', price: 150, image: 'new images/wmremove-transformed (1).png', description: 'Crispy fried corn.' },
    { id: 91, name: 'Chinese Bhel', price: 160, image: 'new images/wmremove-transformed (3).png', description: 'Crispy noodle bhel — Indo-Chinese.' },
    { id: 96, name: 'Chinese Bhel — Chinese on Kilo', price: 160, priceLabel: '₹160 / ₹300 (500 g / 1 kg)', image: 'new images/wmremove-transformed (3).png', description: 'Bulk Chinese bhel.' }
  ],
  bhaji: [
    { id: 97, name: 'Regular Bhaji', price: 120, priceLabel: '₹120 / ₹230 (500 g / 1 kg)', image: 'new images/plate2.png', description: 'Classic pav bhaji by weight.' },
    { id: 98, name: 'Swaminarayan Bhaji', price: 120, priceLabel: '₹120 / ₹230 (500 g / 1 kg)', image: 'new images/veg .png', description: 'No onion/garlic bhaji.' },
    { id: 99, name: 'Bowl Bhaji', price: 130, priceLabel: '₹130 / ₹250 (500 g / 1 kg)', image: 'new images/wmremove-transformed.png', description: 'Rich bowl-style bhaji.' },
    { id: 100, name: 'Paneer Bhaji', price: 150, priceLabel: '₹150 / ₹270 (500 g / 1 kg)', image: 'new images/paneer chilli dry.png', description: 'Bhaji with paneer.' },
    { id: 101, name: 'Special Bhaji', price: 160, priceLabel: '₹160 / ₹300 (500 g / 1 kg)', image: 'new images/new one .png', description: 'Chef\'s special bhaji.' }
  ],
  pulao: [
    { id: 102, name: 'Regular Pulao', price: 120, priceLabel: '₹120 / ₹230 (500 g / 1 kg)', image: 'new images/garlic rice.png', description: 'Fragrant veg pulao.' },
    { id: 103, name: 'Swaminarayan Pulao', price: 120, priceLabel: '₹120 / ₹230 (500 g / 1 kg)', image: 'new images/paneer rice.jpeg', description: 'No onion/garlic pulao.' },
    { id: 104, name: 'Jain Pulao', price: 120, priceLabel: '₹120 / ₹230 (500 g / 1 kg)', image: 'new images/noodles rice.jpeg', description: 'Jain-style pulao.' },
    { id: 105, name: 'Dry Fruit Pulao', price: 140, priceLabel: '₹140 / ₹260 (500 g / 1 kg)', image: 'new images/tripple.png', description: 'Pulao with nuts and dry fruits.' },
    { id: 106, name: 'Kashmiri Pulao', price: 140, priceLabel: '₹140 / ₹260 (500 g / 1 kg)', image: 'new images/maxican.png', description: 'Sweet Kashmiri-style pulao.' },
    { id: 107, name: 'Special Pulao', price: 160, priceLabel: '₹160 / ₹300 (500 g / 1 kg)', image: 'new images/wmremove-transformed (1).png', description: 'Chef\'s special pulao.' }
  ],
  pau: [
    { id: 108, name: 'Regular Pau', price: 25, priceLabel: '₹25 / ₹45 (6 / 12 pcs)', image: 'new images/Gemini_Generated_Image_whwnclwhwnclwhwn.png', description: 'Soft pav buns — 6 or 12 pieces.' },
    { id: 109, name: 'Oil Pau', price: 40, priceLabel: '₹40 / ₹70 (6 / 12 pcs)', image: 'new images/new vadapau.png', description: 'Oil-toasted pav — 6 or 12 pieces.' },
    { id: 110, name: 'Butter Pau', price: 50, priceLabel: '₹50 / ₹90 (6 / 12 pcs)', image: 'new images/butter jam.png', description: 'Butter-toasted pav — 6 or 12 pieces.' }
  ],
  combos: [
    { id: 111, name: '250 g Bhaji + 2 Oil Pau', price: 90, image: 'new images/plate2.png', description: 'Quick combo — bhaji with oil pav.' },
    { id: 112, name: '250 g Bhaji + 2 Butter Pau', price: 110, image: 'new images/butter jam.png', description: 'Bhaji with butter pav.' },
    { id: 113, name: '500 g Bhaji + 500 g Pulao + 6 Reg Pau', price: 240, image: 'new images/wmremove-transformed (2).png', description: 'Family-style platter combo.' },
    { id: 114, name: '500 g Bhaji + 500 g Pulao + 6 Oil Pau', price: 250, image: 'new images/new vadapau.png', description: 'Same combo with oil pav.' },
    { id: 115, name: '1 kg Bhaji + 1 kg Pulao + 12 Reg Pau', price: 460, image: 'new images/tripple.png', description: 'Large gathering combo.' },
    { id: 116, name: '1 kg Bhaji + 1 kg Pulao + 12 Oil Pau', price: 480, image: 'new images/new one .png', description: 'Large combo with oil pav.' },
    { id: 117, name: 'Add Butter — 500 g Bhaji / Pulao', price: 20, image: 'new images/butter jam.png', description: 'Extra butter for 500 g portion.' },
    { id: 118, name: 'Add Butter — 1 kg Bhaji / Pulao', price: 40, image: 'new images/cheese.png', description: 'Extra butter for 1 kg portion.' },
    { id: 119, name: 'Add Butter — 500 g Combo', price: 40, image: 'new images/cheese puff.png', description: 'Extra butter on 500 g combo meals.' },
    { id: 120, name: 'Add Butter — 1 kg Combo', price: 60, image: 'new images/paneer chilli dry.png', description: 'Extra butter on 1 kg combo meals.' },
    { id: 121, name: 'Lasan Chutney (250 g)', price: 100, image: 'new images/wmremove-transformed (3).png', description: 'Garlic chutney tub.' }
  ],
  punjabi_veg: [
    { id: 127, name: 'Veg Masala', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Punjabi veg tadka — 300 g ~2–3 · 500 g ~3–4 · 1 kg ~5–6 persons. Groundnut oil · Amul dairy.' },
    { id: 128, name: 'Veg Kadai', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Punjabi veg tadka — portion guide as on menu parcel.' },
    { id: 129, name: 'Veg Kolhapuri', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Spicy Kolhapuri-style veg curry by weight.' },
    { id: 130, name: 'Veg Hyderabadi', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Hyderabadi-spiced veg gravy — parcel portions.' },
    { id: 131, name: 'Veg Jaipuri', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Jaipuri-style veg masala.' },
    { id: 132, name: 'Veg Chatpata', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Tangy chatpata veg curry.' },
    { id: 133, name: 'Chana Masala', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Classic chana masala — Punjabi parcel menu.' },
    { id: 134, name: 'Veg Korma', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Mild, creamy veg korma.' },
    { id: 135, name: 'Mix Veg', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Mixed vegetable Punjabi curry.' },
    { id: 136, name: 'Veg Angara', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Smoky angara-style veg masala.' },
    { id: 137, name: 'Aloo Palak', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/aloo muter grill.png', description: 'Potato and spinach curry.' },
    { id: 138, name: 'Aloo Mutter', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/aloo muter grill.png', description: 'Aloo mutter Punjabi style.' },
    { id: 139, name: 'Dum Aloo', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Slow-cooked dum aloo gravy.' },
    { id: 140, name: 'Veg Kofta', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/wmremove-transformed.png', description: 'Veg kofta in rich gravy.' },
    { id: 141, name: 'Veg Handi', price: 180, priceLabel: '₹180 / ₹280 / ₹550 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Handi-style veg curry.' }
  ],
  punjabi_paneer: [
    { id: 142, name: 'Paneer Tikka Masala', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Paneer specials — 300 g ~2–3 · 500 g ~3–4 · 1 kg ~5–6 persons.' },
    { id: 143, name: 'Paneer Butter Masala', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Rich butter masala paneer.' },
    { id: 144, name: 'Paneer Kadai', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer chillie gravy.png', description: 'Kadai masala paneer.' },
    { id: 145, name: 'Paneer Tawa Masala', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer chilli dry.png', description: 'Tawa-fried paneer masala.' },
    { id: 146, name: 'Paneer Rajwadi', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Rajwadi-style paneer curry.' },
    { id: 147, name: 'Paneer Kolhapuri', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer chillie gravy.png', description: 'Spicy Kolhapuri paneer.' },
    { id: 148, name: 'Paneer Angara', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Smoky angara paneer.' },
    { id: 149, name: 'Paneer Bhuna Masala', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer chillie gravy.png', description: 'Bhuna-style thick paneer masala.' },
    { id: 150, name: 'Mutter Paneer', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Peas and paneer curry.' },
    { id: 151, name: 'Palak Paneer', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer chillie gravy.png', description: 'Creamy spinach paneer.' },
    { id: 152, name: 'Shahi Paneer', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Royal shahi paneer gravy.' },
    { id: 153, name: 'Paneer Chatpata', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer chilli dry.png', description: 'Tangy chatpata paneer.' },
    { id: 154, name: 'Paneer Lababdar', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Rich lababdar paneer.' },
    { id: 155, name: 'Paneer Korma', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Mild paneer korma.' },
    { id: 156, name: 'Malai Kofta', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Malai kofta in creamy gravy.' },
    { id: 157, name: 'Paneer Toofani', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer chillie gravy.png', description: 'Toofani spicy paneer.' },
    { id: 158, name: 'Paneer Kadhai', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer chillie gravy.png', description: 'Kadhai-style paneer.' },
    { id: 159, name: 'Paneer Handi', price: 200, priceLabel: '₹200 / ₹300 / ₹580 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Handi-cooked paneer curry.' }
  ],
  punjabi_kaju: [
    { id: 160, name: 'Kaju Curry (Spicy)', price: 210, priceLabel: '₹210 / ₹330 / ₹620 (300 g / 500 g / 1 kg)', image: 'new images/paneer rice.jpeg', description: 'Kaju delights — premium cashew gravies by weight.' },
    { id: 161, name: 'Kaju Masala', price: 210, priceLabel: '₹210 / ₹330 / ₹620 (300 g / 500 g / 1 kg)', image: 'new images/paneer rice.jpeg', description: 'Classic kaju masala.' },
    { id: 162, name: 'Kaju Butter Masala', price: 210, priceLabel: '₹210 / ₹330 / ₹620 (300 g / 500 g / 1 kg)', image: 'new images/paneer rice.jpeg', description: 'Butter-rich kaju curry.' },
    { id: 163, name: 'Kaju Paneer Masala', price: 210, priceLabel: '₹210 / ₹330 / ₹620 (300 g / 500 g / 1 kg)', image: 'new images/paneer manchurinad gravy.png', description: 'Kaju and paneer combined masala.' },
    { id: 164, name: 'Kaju Kofta (Sweet)', price: 210, priceLabel: '₹210 / ₹330 / ₹620 (300 g / 500 g / 1 kg)', image: 'new images/choicolate.png', description: 'Sweet kaju kofta curry.' },
    { id: 165, name: 'Khoya Kaju (Sweet)', price: 210, priceLabel: '₹210 / ₹330 / ₹620 (300 g / 500 g / 1 kg)', image: 'new images/choicolate.png', description: 'Khoya kaju — mild sweet gravy.' }
  ],
  punjabi_dal: [
    { id: 166, name: 'Dal Fry', price: 150, priceLabel: '₹150 / ₹230 / ₹450 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Classic dal fry — Punjabi parcel menu.' },
    { id: 167, name: 'Dal Tadka', price: 170, priceLabel: '₹170 / ₹250 / ₹480 (300 g / 500 g / 1 kg)', image: 'new images/plate2.png', description: 'Tempered dal tadka.' },
    { id: 168, name: 'Dal Tadka Butter', price: 170, priceLabel: '₹170 / ₹280 / ₹530 (300 g / 500 g / 1 kg)', image: 'new images/butter jam.png', description: 'Dal tadka with extra butter.' },
    { id: 169, name: 'Dal Khichdi', price: 150, priceLabel: '₹150 / ₹230 / ₹450 (300 g / 500 g / 1 kg)', image: 'new images/garlic rice.png', description: 'Comforting dal khichdi by weight.' }
  ],
  punjabi_rice: [
    { id: 170, name: 'Plain Rice', price: 80, priceLabel: '₹80 / ₹150 / ₹280 (300 g / 500 g / 1 kg)', image: 'new images/garlic rice.png', description: 'Steamed plain rice — parcel portions.' },
    { id: 171, name: 'Jeera Rice', price: 100, priceLabel: '₹100 / ₹180 / ₹350 (300 g / 500 g / 1 kg)', image: 'new images/garlic rice.png', description: 'Cumin tempered jeera rice.' },
    { id: 172, name: 'Veg Biryani', price: 140, priceLabel: '₹140 / ₹260 / ₹500 (300 g / 500 g / 1 kg)', image: 'new images/maxican.png', description: 'Fragrant veg biryani.' },
    { id: 173, name: 'Hyderabadi Biryani', price: 160, priceLabel: '₹160 / ₹270 / ₹530 (300 g / 500 g / 1 kg)', image: 'new images/maxican.png', description: 'Hyderabadi-style veg biryani.' }
  ],
  punjabi_roti: [
    { id: 174, name: 'Plain Tawa Roti', price: 10, image: 'new images/Gemini_Generated_Image_whwnclwhwnclwhwn.png', description: 'Soft tawa roti — per piece.' },
    { id: 175, name: 'Butter Tawa Roti', price: 15, image: 'new images/Gemini_Generated_Image_whwnclwhwnclwhwn.png', description: 'Butter brushed tawa roti — per piece.' },
    { id: 176, name: 'Plain Tandoori Roti', price: 30, image: 'new images/bread butter.png', description: 'Tandoori roti — per piece.' },
    { id: 177, name: 'Butter Tandoori Roti', price: 35, image: 'new images/butter jam.png', description: 'Butter tandoori roti — per piece.' },
    { id: 178, name: 'Butter Naan', price: 45, image: 'new images/bread butter.png', description: 'Butter naan — per piece.' },
    { id: 179, name: 'Paratha', price: 30, image: 'new images/bread butter.png', description: 'Plain paratha — per piece.' },
    { id: 180, name: 'Butter Paratha', price: 35, image: 'new images/butter jam.png', description: 'Butter paratha — per piece.' }
  ],
  beverages: [
    { id: 122, name: 'Thums Up', price: 20, image: 'images/default.png', description: 'Chilled Thums Up.' },
    { id: 123, name: 'Fanta', price: 20, image: 'images/default.png', description: 'Chilled Fanta.' },
    { id: 124, name: 'Sprite', price: 20, image: 'images/default.png', description: 'Chilled Sprite.' },
    { id: 125, name: 'Water Bottle (500 ml)', price: 10, image: 'images/default.png', description: 'Packaged drinking water.' },
    { id: 126, name: 'Water Bottle (1 L)', price: 20, image: 'images/default.png', description: 'One-litre water bottle.' }
  ]
};
