import type { CatalogProduct, ProductSelection } from "./productPricing";

export const PRODUCTS: CatalogProduct[] = [
    {
      id: "combo",
      name: "Combo",
      nameHi: "कॉम्बो",
      categories: ["Mains"],
      favourite: true,
      gradient: ["#C97B2E", "#7A3E12"],
      image: "assets/menu/wmremove-transformed-2.jpg",
      sizes: [
        { id: "250g", label: "250g" },
        { id: "500g", label: "500g" },
        { id: "1kg", label: "1kg" }
      ],
      defaultSize: "500g",
      // CONFIRM: Combo Regular 250g (85?), 500g (240?) — Oil prices verified
      basePrice: { "250g": 85, "500g": 240, "1kg": 460 },
      groups: [
        {
          id: "type",
          label: "Type",
          options: [
            { id: "regular", label: "Regular", extra: 0 },
            {
              id: "oil",
              label: "Oil",
              // 250 Oil=90 → +5; 500 Oil=250 → +10; 1kg Oil=480 → +20
              extra: { "250g": 5, "500g": 10, "1kg": 20 }
            }
          ]
        }
      ],
      addons: [
        {
          id: "butter",
          label: "Butter",
          // 500g verified +40; CONFIRM 250g (20?), 1kg (80?) — seed 1kg was 60
          extra: { "250g": 20, "500g": 40, "1kg": 80 }
        }
      ],
      aliases: [
        "500 gm combo",
        "1 kg combo",
        "250 g combo",
        "combo oil",
        "combo reg",
        "bhaji pulao pau",
        "500 g bhaji + 500 g pulao",
        "add butter combo"
      ]
    },
    {
      id: "bhaji",
      name: "Bhaji",
      nameHi: "भाजी",
      categories: ["Mains"],
      favourite: true,
      gradient: ["#D9582B", "#7C1D0B"],
      image: "assets/menu/plate2.jpg",
      sizes: [
        { id: "300g", label: "300g" },
        { id: "500g", label: "500g" },
        { id: "1kg", label: "1kg" }
      ],
      defaultSize: "500g",
      basePrice: { "300g": 75, "500g": 120, "1kg": 230 },
      groups: [
        {
          id: "prep",
          label: "Preparation",
          options: [
            { id: "regular", label: "Regular", extra: 0 },
            { id: "swaminarayan", label: "Swaminarayan", extra: 0 },
            { id: "jain", label: "Jain", extra: { "300g": 5, "500g": 10, "1kg": 20 } }
          ]
        },
        {
          id: "variety",
          label: "Variety",
          options: [
            { id: "regular", label: "Regular", extra: 0 },
            { id: "paneer", label: "Paneer", extra: { "300g": 20, "500g": 30, "1kg": 40 } },
            { id: "special", label: "Special", extra: { "300g": 25, "500g": 40, "1kg": 70 } }
          ]
        }
      ],
      addons: [
        {
          id: "butter",
          label: "Butter",
          extra: { "300g": 15, "500g": 20, "1kg": 40 }
        }
      ],
      aliases: [
        "regular bhaji",
        "oil bhaji",
        "jain bhaji",
        "swaminarayan bhaji",
        "paneer bhaji",
        "special bhaji",
        "500 gm bhaji",
        "1 kg bhaji",
        "bhaji oil"
      ]
    },
    {
      id: "pulao",
      name: "Pulao",
      nameHi: "पुलाव",
      categories: ["Mains"],
      favourite: true,
      gradient: ["#D9B44A", "#8C6A12"],
      image: "",
      sizes: [
        { id: "500g", label: "500g" },
        { id: "1kg", label: "1kg" }
      ],
      defaultSize: "500g",
      basePrice: { "500g": 120, "1kg": 230 },
      groups: [
        {
          id: "prep",
          label: "Preparation",
          options: [
            { id: "regular", label: "Regular", extra: 0 },
            { id: "swaminarayan", label: "Swaminarayan", extra: 0 },
            { id: "jain", label: "Jain", extra: 0 }
          ]
        },
        {
          id: "variety",
          label: "Variety",
          options: [
            { id: "regular", label: "Regular", extra: 0 },
            { id: "dry_fruit", label: "Dry Fruit", extra: { "500g": 20, "1kg": 30 } },
            { id: "kashmiri", label: "Kashmiri", extra: { "500g": 20, "1kg": 30 } },
            { id: "special", label: "Special", extra: { "500g": 40, "1kg": 70 } }
          ]
        }
      ],
      addons: [
        {
          id: "butter",
          label: "Butter",
          extra: { "500g": 20, "1kg": 40 }
        }
      ],
      aliases: [
        "regular pulao",
        "dry fruit pulao",
        "dryfruit pulao",
        "jain pulao",
        "swaminarayan pulao",
        "kashmiri pulao",
        "special pulao",
        "500 gm pulao"
      ]
    },
    {
      id: "pau",
      name: "Pau",
      nameHi: "पाव",
      categories: ["Mains"],
      favourite: true,
      gradient: ["#E0A76B", "#9A5A22"],
      image: "assets/menu/new-vadapau.jpg",
      sizes: [
        { id: "6pcs", label: "6 pcs" },
        { id: "12pcs", label: "12 pcs" }
      ],
      defaultSize: "6pcs",
      basePrice: { "6pcs": 25, "12pcs": 45 },
      groups: [
        {
          id: "type",
          label: "Type",
          options: [
            { id: "regular", label: "Regular", extra: 0 },
            { id: "oil", label: "Oil", extra: { "6pcs": 15, "12pcs": 25 } }
          ]
        }
      ],
      aliases: ["regular pau", "oil pau", "oil pav", "regular pav", "pav", "6 pau", "12 pau"]
    },
    {
      id: "roti",
      name: "Tawa Roti",
      nameHi: "तवा रोटी",
      categories: ["Punjabi"],
      gradient: ["#C9A06A", "#7D5A2E"],
      image: "assets/menu/gemini-generated-image-whwnclwhwnclwhwn.jpg",
      sizes: [{ id: "1pc", label: "1 pc" }],
      defaultSize: "1pc",
      basePrice: { "1pc": 10 },
      groups: [
        {
          id: "type",
          label: "Type",
          options: [
            { id: "plain", label: "Plain", extra: 0 },
            { id: "butter", label: "Butter", extra: 5 }
          ]
        }
      ],
      aliases: ["plain tawa roti", "butter tawa roti", "tawa roti", "roti"]
    },
    {
      id: "manchurian",
      name: "Manchurian",
      nameHi: "मंचूरियन",
      categories: ["Chinese"],
      favourite: true,
      gradient: ["#8A3B2B", "#3E150E"],
      image: "assets/menu/wmremove-transformed.jpg",
      sizes: [
        { id: "500g", label: "500g" },
        { id: "1kg", label: "1kg" }
      ],
      defaultSize: "500g",
      basePrice: { "500g": 120, "1kg": 230 },
      groups: [
        {
          id: "dish",
          label: "Dish",
          options: [
            { id: "dry", label: "Dry", extra: 0 },
            { id: "gravy", label: "Gravy", extra: 0 },
            // CONFIRM: Noodles 1kg (230?), Fried Rice 500g (120?)
            { id: "noodles", label: "Noodles", extra: 0 },
            { id: "fried_rice", label: "Fried Rice", extra: 0 }
          ]
        }
      ],
      aliases: [
        "manchurian dry",
        "dry manchurian",
        "gravy manchurian",
        "manchurian noodles",
        "manchurian fried rice",
        "fried rice",
        "manchurian rice"
      ]
    },
    {
      id: "biryani",
      name: "Hyderabadi Biryani",
      nameHi: "हैदराबादी बिरयानी",
      categories: ["Punjabi"],
      gradient: ["#D18A3C", "#6E3B0F"],
      image: "assets/menu/maxican.jpg",
      sizes: [
        { id: "300g", label: "300g" },
        { id: "500g", label: "500g" },
        { id: "1kg", label: "1kg" }
      ],
      defaultSize: "500g",
      basePrice: { "300g": 160, "500g": 270, "1kg": 530 },
      aliases: ["hyderabadi biryani", "biryani", "hyd biryani"]
    }
  ];

export const SUGGESTION_SEEDS: Record<string, string[]> = {
    bhaji: ["pau", "pulao", "manchurian", "roti"],
    pau: ["bhaji", "pulao"],
    pulao: ["bhaji", "manchurian", "pau"],
    manchurian: ["pulao", "bhaji", "combo"],
    combo: ["pau", "manchurian"],
    roti: ["bhaji", "biryani"],
    biryani: ["manchurian", "pau"]
  };

export type ConfigSeed = { productId: string; size: string; options: Record<string, string>; label: string };
export const SUGGESTION_CONFIG_SEEDS: Record<string, ConfigSeed[]> = {
    bhaji: [
      { productId: "pau", size: "6pcs", options: { type: "oil" }, label: "6 Oil Pau" },
      { productId: "pau", size: "6pcs", options: { type: "regular" }, label: "6 Reg Pau" },
      { productId: "pulao", size: "500g", options: { prep: "regular", variety: "regular" }, label: "Pulao 500g" },
      { productId: "manchurian", size: "500g", options: { dish: "dry" }, label: "Manchurian Dry" },
      { productId: "roti", size: "1pc", options: { type: "plain" }, label: "Plain Tawa Roti" }
    ],
    pau: [
      { productId: "bhaji", size: "500g", options: { prep: "regular", variety: "regular" }, label: "Bhaji 500g" },
      { productId: "pulao", size: "500g", options: { prep: "regular", variety: "regular" }, label: "Pulao 500g" }
    ],
    pulao: [
      { productId: "bhaji", size: "500g", options: { prep: "regular", variety: "regular" }, label: "Bhaji 500g" },
      { productId: "manchurian", size: "500g", options: { dish: "dry" }, label: "Manchurian Dry" },
      { productId: "pau", size: "6pcs", options: { type: "oil" }, label: "6 Oil Pau" }
    ],
    manchurian: [
      { productId: "pulao", size: "500g", options: { prep: "regular", variety: "regular" }, label: "Pulao 500g" },
      { productId: "bhaji", size: "500g", options: { prep: "regular", variety: "regular" }, label: "Bhaji 500g" },
      { productId: "combo", size: "500g", options: { type: "oil" }, label: "Combo 500g Oil" }
    ],
    combo: [
      { productId: "pau", size: "6pcs", options: { type: "oil" }, label: "6 Oil Pau" },
      { productId: "manchurian", size: "500g", options: { dish: "dry" }, label: "Manchurian Dry" }
    ],
    roti: [
      { productId: "bhaji", size: "500g", options: { prep: "regular", variety: "regular" }, label: "Bhaji 500g" },
      { productId: "biryani", size: "500g", options: {}, label: "Hyderabadi 500g" }
    ],
    biryani: [
      { productId: "manchurian", size: "500g", options: { dish: "dry" }, label: "Manchurian Dry" },
      { productId: "pau", size: "6pcs", options: { type: "oil" }, label: "6 Oil Pau" }
    ]
  };

export const HIDE_NAME_PATTERNS: RegExp[] = [
    /^250\s*g\s*bhaji\s*\+\s*2\s*(oil|butter)\s*pau$/i,
    /^500\s*g\s*bhaji\s*\+\s*500\s*g\s*pulao\s*\+\s*6\s*(reg|oil)\s*pau$/i,
    /^1\s*kg\s*bhaji\s*\+\s*1\s*kg\s*pulao\s*\+\s*12\s*(reg|oil)\s*pau$/i,
    /^add\s*butter\s*[—–-]\s*(500\s*g|1\s*kg)\s*combo$/i,
    /^add\s*butter\s*[—–-]\s*(500\s*g|1\s*kg)\s*bhaji/i,
    /^regular\s*bhaji\b/i,
    /^oil\s*bhaji\b/i,
    /^jain\s*bhaji\b/i,
    /^swaminarayan\s*bhaji\b/i,
    /^paneer\s*bhaji\b/i,
    /^special\s*bhaji\b/i,
    /^bhaji\s*(300\s*g|300g|500\s*g|500g|1\s*kg|1kg)\b/i,
    /^regular\s*pulao\b/i,
    /^dry\s*fruit\s*pulao\b/i,
    /^dryfruit\s*pulao\b/i,
    /^jain\s*pulao\b/i,
    /^swaminarayan\s*pulao\b/i,
    /^kashmiri\s*pulao\b/i,
    /^special\s*pulao\b/i,
    /^pulao\s*(500\s*g|500g|1\s*kg|1kg)\b/i,
    /^regular\s*pau\b/i,
    /^oil\s*pau\b/i,
    /^regular\s*pav\b/i,
    /^oil\s*pav\b/i,
    /^plain\s*tawa\s*roti$/i,
    /^butter\s*tawa\s*roti$/i,
    /^hyderabadi\s*biryani\b/i,
    /^dry\s*manchurian$/i,
    /^gravy\s*manchurian$/i,
    /^manchurian\s*dry\b/i,
    /^manchurian\s*noodles$/i,
    /^manchurian\s*rice$/i,
    /^manchurian\s*fried\s*rice\b/i
  ];

export function getProducts() {
  return PRODUCTS;
}

export function getProduct(id: string) {
  return PRODUCTS.find((p) => p.id === String(id || "")) || null;
}

export function shouldHideLegacyItem(name: string) {
  const n = String(name || "").trim();
  if (!n) return false;
  return HIDE_NAME_PATTERNS.some((re) => re.test(n));
}

export function defaultSelection(product: CatalogProduct | string, sizeOverride?: string): ProductSelection | null {
  const p = typeof product === "string" ? getProduct(product) : product;
  if (!p) return null;
  const size =
    sizeOverride && p.sizes.some((s) => s.id === sizeOverride)
      ? sizeOverride
      : p.defaultSize || (p.sizes[0] && p.sizes[0].id) || "";
  const options: Record<string, string> = {};
  (p.groups || []).forEach((g) => {
    if (g.options && g.options[0]) options[g.id] = g.options[0].id;
  });
  return { productId: p.id, size, options, addons: [], qty: 1 };
}

export function isSingleConfig(product: CatalogProduct | string) {
  const p = typeof product === "string" ? getProduct(product) : product;
  if (!p) return true;
  if ((p.sizes || []).length > 1) return false;
  if ((p.addons || []).length > 0) return false;
  for (const g of p.groups || []) {
    if ((g.options || []).length > 1) return false;
  }
  return true;
}

export function fromPrice(product: CatalogProduct) {
  const size = product.defaultSize || product.sizes[0]?.id;
  return Number(product.basePrice?.[size || ""]) || 0;
}
