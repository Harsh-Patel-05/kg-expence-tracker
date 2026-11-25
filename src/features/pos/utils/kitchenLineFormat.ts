/** Kitchen / KDS line title + detail (Hindi-aware). */

const HI_WORDS: Record<string, string> = {
  dry: "सूखा",
  gravy: "ग्रेवी",
  oil: "तेल",
  butter: "बटर",
  special: "स्पेशल",
  swaminarayan: "स्वामीनारायण",
  jain: "जैन",
  regular: "रेगुलर",
  noodles: "नूडल्स",
  "fried rice": "फ्राइड राइस",
  paneer: "पनीर",
  "dry fruit": "ड्राई फ्रूट",
  kashmiri: "कश्मीरी",
  plain: "सादा",
  pcs: "पीस",
  pc: "पीस",
  pieces: "पीस"
};

/** POS catalog / common dish English → Hindi (matches last POS catalog nameHi). */
const HI_DISH: Record<string, string> = {
  pau: "पाव",
  pav: "पाव",
  pulao: "पुलाव",
  pulav: "पुलाव",
  bhaji: "भाजी",
  manchurian: "मंचूरियन",
  combo: "कॉम्बो",
  "hyderabadi biryani": "हैदराबादी बिरयानी",
  biryani: "हैदराबादी बिरयानी",
  "tawa roti": "तवा रोटी",
  roti: "रोटी",
  "butter paratha": "बटर पराठा",
  paratha: "पराठा"
};

export function hindiDishName(englishOrHi: string): string {
  const raw = String(englishOrHi || "").trim();
  if (!raw) return "";
  if (/[\u0900-\u097F]/.test(raw)) return raw;
  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (HI_DISH[key]) return HI_DISH[key];
  // partial: "Hyderabadi Biryani 500g" already stripped to base before call
  for (const [en, hi] of Object.entries(HI_DISH)) {
    if (key === en || key.startsWith(en + " ") || key.endsWith(" " + en)) return hi;
  }
  return raw;
}

function translateWord(raw: string, lang: "hi" | "en"): string {
  const s = String(raw || "").trim();
  if (!s || lang !== "hi") return s;
  const key = s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (HI_WORDS[key]) return HI_WORDS[key];
  return s;
}

/** Normalize size like 500g / 1kg / 6 pcs → kitchen-friendly label. */
export function formatSizeLabel(raw: string, lang: "hi" | "en" = "en"): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(kg|gms|gm|g|pcs?|pieces?|किलो|ग्राम|पीस)?\.?$/i);
  if (m) {
    const n = m[1];
    const u = String(m[2] || "g").toLowerCase();
    if (lang === "hi") {
      if (u.startsWith("kg") || u === "किलो") return `${n} किलो`;
      if (u.startsWith("pc") || u.startsWith("piece") || u === "पीस") return `${n} पीस`;
      return `${n} ग्राम`;
    }
    if (u.startsWith("kg")) return `${n} kg`;
    if (u.startsWith("pc") || u.startsWith("piece")) return `${n} pcs`;
    if (u === "g" || u.startsWith("gm")) return `${n} g`;
    return `${n} ${u}`;
  }
  return translateWord(s, lang);
}

function splitDots(s: string): string[] {
  return String(s || "")
    .split(/\s*[·•|]\s*|\s+\+\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Pull base dish + size + modifiers from a POS line name like
 * "Manchurian 500g · Dry" or "Bhaji 1kg · Swaminarayan · Special + Butter"
 */
export function parseKitchenLineName(name: string): { base: string; size: string; mods: string[] } {
  const raw = String(name || "").trim();
  if (!raw) return { base: "", size: "", mods: [] };

  const parts = splitDots(raw);
  if (parts.length >= 2) {
    const head = parts[0];
    const rest = parts.slice(1);
    const sizeInHead = head.match(/^(.*?)[\s-]+(\d+(?:\.\d+)?\s*(?:kg|gms|gm|g|pcs?|pieces?))\s*$/i);
    if (sizeInHead) {
      return {
        base: sizeInHead[1].trim(),
        size: sizeInHead[2].trim(),
        mods: rest
      };
    }
    // First trailing part might be size: "Pau 6 pcs"
    const sizeOnly = rest[0].match(/^\d+(?:\.\d+)?\s*(?:kg|gms|gm|g|pcs?|pieces?)$/i);
    if (sizeOnly) {
      return { base: head, size: rest[0], mods: rest.slice(1) };
    }
    return { base: head, size: "", mods: rest };
  }

  const sizeAtEnd = raw.match(/^(.*?)[\s-]+(\d+(?:\.\d+)?\s*(?:kg|gms|gm|g|pcs?|pieces?))\s*$/i);
  if (sizeAtEnd) {
    return { base: sizeAtEnd[1].trim(), size: sizeAtEnd[2].trim(), mods: [] };
  }
  return { base: raw, size: "", mods: [] };
}

export type KitchenLineView = {
  title: string;
  detail: string;
};

export function formatKitchenLineView(
  lang: "hi" | "en",
  line: {
    name?: string;
    nameHi?: string;
    nameHead?: string;
    nameSub?: string;
    note?: string;
    kitchenNote?: string;
  }
): KitchenLineView {
  const parsed = parseKitchenLineName(String(line.name || line.nameHead || ""));
  const hiBase = String(line.nameHi || "").trim();
  const enBase = parsed.base || String(line.nameHead || line.name || "").trim();

  // Prefer Hindi dish name (line nameHi → catalog fallback map → English)
  const titleEn = parseKitchenLineName(enBase).base || enBase || "Item";
  const titleHiRaw = parseKitchenLineName(hiBase).base || hiBase;
  const title =
    lang === "hi"
      ? hindiDishName(titleHiRaw || titleEn) || titleEn || "आइटम"
      : titleEn || titleHiRaw || "Item";

  const sizeFromSub = String(line.nameSub || "")
    .split(/\s*[·•|]\s*/)
    .map((x) => x.trim())
    .find((x) => /^\d+(?:\.\d+)?\s*(kg|gms|gm|g|pcs?)/i.test(x));
  const size = formatSizeLabel(parsed.size || sizeFromSub || "", lang);

  const subMods = splitDots(String(line.nameSub || "")).filter(
    (x) => !/^\d+(?:\.\d+)?\s*(kg|gms|gm|g|pcs?)/i.test(x)
  );
  const mods = [...parsed.mods, ...subMods]
    .map((m) => translateWord(m, lang))
    .filter(Boolean);
  // de-dupe
  const seen = new Set<string>();
  const uniqMods = mods.filter((m) => {
    const k = m.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const detailParts = [size, ...uniqMods].filter(Boolean);
  return {
    title,
    detail: detailParts.join(" · ")
  };
}
