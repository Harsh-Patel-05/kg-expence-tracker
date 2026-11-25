import { GoogleAuth } from "google-auth-library";
import {
  computeBalances,
  isPaidExpense,
  isActiveSale,
  saleAmounts,
  recordIsOnline,
  num
} from "../src/lib/balanceMath";

async function list(col: string, token: string) {
  const base = "https://firestore.googleapis.com/v1/projects/kilogram-expance-trakker/databases/(default)/documents";
  const out: any[] = [];
  let pageToken = "";
  for (;;) {
    const url = new URL(`${base}/${col}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    for (const d of json.documents || []) {
      const id = d.name.split("/").pop();
      const o: any = { id };
      for (const [k, v] of Object.entries(d.fields || {})) o[k] = decode(v);
      out.push(o);
    }
    pageToken = json.nextPageToken || "";
    if (!pageToken) break;
  }
  return out;
}

function decode(v: any): any {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) {
    const o: any = {};
    for (const [k, vv] of Object.entries(v.mapValue.fields || {})) o[k] = decode(vv);
    return o;
  }
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  return v;
}

function day(x: any) {
  return String(x?.date || x?.paidAt || "").slice(0, 10);
}

async function main() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore", "https://www.googleapis.com/auth/cloud-platform"]
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("no token");

  const [sales, expenses, advances, purchases, supplierPayments, salaries, investments, profitWithdrawals, balanceTransfers] =
    await Promise.all([
      list("sales", token),
      list("expenses", token),
      list("advances", token),
      list("purchases", token),
      list("supplierPayments", token),
      list("salaries", token),
      list("investments", token),
      list("profit_withdrawals", token),
      list("balance_transfers", token)
    ]);

  const bal = computeBalances({
    sales,
    expenses,
    advances,
    purchases: purchases.map((p) => ({ ...p, price: num(p.price ?? p.total) })),
    supplierPayments,
    salaries,
    investments,
    profitWithdrawals,
    balanceTransfers
  });
  console.log("BALANCES", JSON.stringify(bal, null, 2));

  const from = "2026-11-18";
  const to = "2026-11-24";
  let expCash = 0,
    expOnline = 0,
    saleCash = 0,
    saleBank = 0,
    advCash = 0,
    advOnline = 0;
  for (const e of expenses) {
    if (day(e) < from || day(e) > to) continue;
    if (!isPaidExpense(e)) continue;
    if (recordIsOnline(e)) expOnline += num(e.amount);
    else expCash += num(e.amount);
  }
  for (const s of sales) {
    if (day(s) < from || day(s) > to) continue;
    if (!isActiveSale(s)) continue;
    const a = saleAmounts(s);
    saleCash += a.cash;
    saleBank += Math.max(0, a.retail - a.cash);
  }
  for (const a of advances) {
    if (day(a) < from || day(a) > to) continue;
    if (a.isDeleted || a.archived) continue;
    if (recordIsOnline(a)) advOnline += num(a.amount);
    else advCash += num(a.amount);
  }
  console.log("RANGE", { from, to, saleCash, saleBank, expCash, expOnline, advCash, advOnline });
  console.log("activeSales", sales.filter(isActiveSale).length, "/", sales.length);
  console.log("paidExpenses", expenses.filter(isPaidExpense).length, "/", expenses.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
