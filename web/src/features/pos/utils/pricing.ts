import { num } from "@/lib/utils";
import type {
  BillTotals,
  CartLine,
  ChargeLine,
  CouponDoc,
  DiscountState,
  TaxConfig,
  TaxMode
} from "../types";

export function lineGross(line: CartLine): number {
  if (line.complimentary) return 0;
  return Math.max(0, num(line.price) * Math.max(0, num(line.qty)));
}

export function lineItemDiscount(line: CartLine): number {
  if (line.complimentary) return 0;
  const gross = lineGross(line);
  const pct = Math.max(0, num(line.itemDiscountPct));
  const amt = Math.max(0, num(line.itemDiscountAmt));
  const fromPct = (gross * pct) / 100;
  return Math.min(gross, fromPct + amt);
}

export function lineNet(line: CartLine): number {
  return Math.max(0, lineGross(line) - lineItemDiscount(line));
}

export function computeCouponDiscount(
  code: string | null | undefined,
  coupons: CouponDoc[],
  subtotalAfterItemDisc: number,
  lines: CartLine[]
): number {
  if (!code) return 0;
  const coupon = coupons.find(
    (c) => String(c.code || "").toUpperCase() === String(code).toUpperCase() && !c.isDeleted && c.status !== "disabled"
  );
  if (!coupon) return 0;
  if (coupon.expiresAt && String(coupon.expiresAt).slice(0, 10) < new Date().toISOString().slice(0, 10)) return 0;
  if (coupon.maxUsage != null && num(coupon.usageCount) >= num(coupon.maxUsage)) return 0;
  if (coupon.minOrder != null && subtotalAfterItemDisc < num(coupon.minOrder)) return 0;

  let eligible = subtotalAfterItemDisc;
  if (coupon.productIds?.length) {
    eligible = lines
      .filter((l) => coupon.productIds!.includes(l.menuItemId))
      .reduce((s, l) => s + lineNet(l), 0);
  } else if (coupon.categoryIds?.length) {
    const cats = new Set(coupon.categoryIds.map((c) => c.toLowerCase()));
    eligible = lines
      .filter((l) => cats.has(String(l.category || "").toLowerCase()))
      .reduce((s, l) => s + lineNet(l), 0);
  }

  let disc = coupon.type === "percent" ? (eligible * num(coupon.value)) / 100 : num(coupon.value);
  if (coupon.maxDiscount != null) disc = Math.min(disc, num(coupon.maxDiscount));
  return Math.max(0, Math.min(eligible, disc));
}

export function computeBillDiscount(discount: DiscountState, base: number, maxPct = 100): number {
  if (!discount || discount.type === "none" || discount.type === "item") return 0;
  const cappedBase = Math.max(0, base);
  if (discount.type === "percent" || discount.type === "bill") {
    const pct = Math.min(Math.max(0, num(discount.value)), Math.max(0, maxPct));
    return (cappedBase * pct) / 100;
  }
  if (discount.type === "fixed") {
    return Math.min(cappedBase, Math.max(0, num(discount.value)));
  }
  return 0;
}

export function splitGst(taxable: number, tax: TaxConfig, interstate = false) {
  const rate = interstate && tax.enableIgst ? num(tax.igstRate) : num(tax.cgstRate) + num(tax.sgstRate);
  const taxAmount = (taxable * rate) / 100;
  if (interstate && tax.enableIgst) {
    return { cgst: 0, sgst: 0, igst: taxAmount, taxAmount, rate };
  }
  const half = taxAmount / 2;
  return { cgst: half, sgst: half, igst: 0, taxAmount, rate };
}

export function extractTaxFromInclusive(grossInclusive: number, rate: number) {
  if (rate <= 0) return { taxable: grossInclusive, tax: 0 };
  const taxable = grossInclusive / (1 + rate / 100);
  return { taxable, tax: grossInclusive - taxable };
}

export function computeBillTotals(args: {
  lines: CartLine[];
  discount: DiscountState;
  couponCode?: string | null;
  coupons?: CouponDoc[];
  charges?: ChargeLine[];
  tax: TaxConfig;
  taxMode?: TaxMode;
  interstate?: boolean;
  maxDiscountPct?: number;
  roundOffEnabled?: boolean;
}): BillTotals {
  const lines = args.lines || [];
  const taxMode = args.taxMode || args.tax.mode || "exclusive";
  const itemDiscountTotal = lines.reduce((s, l) => s + lineItemDiscount(l), 0);
  const subtotal = lines.reduce((s, l) => s + lineGross(l), 0);
  const afterItem = Math.max(0, subtotal - itemDiscountTotal);

  const couponDiscount = computeCouponDiscount(args.couponCode, args.coupons || [], afterItem, lines);
  const afterCoupon = Math.max(0, afterItem - couponDiscount);
  const billDiscount = computeBillDiscount(args.discount, afterCoupon, args.maxDiscountPct ?? 100);
  const afterDiscount = Math.max(0, afterCoupon - billDiscount);

  const charges = (args.charges || []).filter((c) => c.type !== "round_off");
  const chargesTotal = charges.reduce((s, c) => s + num(c.amount), 0);

  let taxable = afterDiscount;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let taxAmount = 0;

  const weightedRate =
    lines.reduce((s, l) => s + lineNet(l) * num(l.taxRate ?? args.tax.cgstRate + args.tax.sgstRate), 0) /
      (afterItem || 1) || num(args.tax.cgstRate) + num(args.tax.sgstRate);

  if (taxMode === "inclusive") {
    const extracted = extractTaxFromInclusive(afterDiscount, weightedRate);
    taxable = extracted.taxable;
    const split = splitGst(taxable, { ...args.tax, cgstRate: weightedRate / 2, sgstRate: weightedRate / 2 }, args.interstate);
    cgst = split.cgst;
    sgst = split.sgst;
    igst = split.igst;
    taxAmount = split.taxAmount;
  } else {
    const split = splitGst(afterDiscount, args.tax, args.interstate);
    taxable = afterDiscount;
    cgst = split.cgst;
    sgst = split.sgst;
    igst = split.igst;
    taxAmount = split.taxAmount;
  }

  let total = taxMode === "inclusive" ? afterDiscount + chargesTotal : afterDiscount + taxAmount + chargesTotal;
  let roundOff = 0;
  if (args.roundOffEnabled !== false) {
    const rounded = Math.round(total);
    roundOff = Math.round((rounded - total) * 100) / 100;
    total = rounded;
  }

  return {
    subtotal,
    itemDiscountTotal,
    billDiscount,
    couponDiscount,
    taxable,
    cgst,
    sgst,
    igst,
    taxAmount,
    chargesTotal,
    roundOff,
    total
  };
}

export function paidTotal(payments: Array<{ amount: number }>): number {
  return (payments || []).reduce((s, p) => s + num(p.amount), 0);
}
