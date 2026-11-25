import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  buildWhatsAppBillMessage,
  canShareWhatsAppBill,
  normalizeWhatsAppPhone,
  shareBillOnWhatsApp,
  type WhatsAppBillPayload,
  type WhatsAppShopSettings
} from "../utils/whatsappBill";
import { printBillPdf } from "../utils/billPdf";
import { inr } from "@/lib/utils";

export function WhatsAppShareModal(props: {
  bill: WhatsAppBillPayload;
  settings?: WhatsAppShopSettings | null;
  onClose: () => void;
  onShared?: (info: { phone: string; name: string }) => void;
}) {
  const { bill, settings, onClose, onShared } = props;
  const [name, setName] = useState(bill.customerName || "");
  const [phone, setPhone] = useState(bill.customerPhone || "");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setName(bill.customerName || "");
    setPhone(bill.customerPhone || "");
  }, [bill]);

  if (!canShareWhatsAppBill(bill)) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-xl bg-card-0 p-4 shadow-float" onClick={(e) => e.stopPropagation()}>
          <p className="text-[14px] text-text-secondary">This channel bill cannot be shared on WhatsApp (Swiggy/Zomato).</p>
          <button type="button" className="kg-btn kg-btn-secondary mt-3" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const payload: WhatsAppBillPayload = {
    ...bill,
    customerName: name.trim() || bill.customerName,
    customerPhone: phone.trim()
  };

  function share() {
    setErr(null);
    if (!normalizeWhatsAppPhone(phone)) {
      setErr("Enter a valid 10-digit WhatsApp number");
      return;
    }
    const res = shareBillOnWhatsApp(payload, { phone, settings, open: true });
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    onShared?.({ phone: phone.trim(), name: name.trim() });
    onClose();
  }

  function pdfThenHint() {
    setErr(null);
    printBillPdf(payload, settings);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-stroke-0 bg-card-0 p-4 shadow-float"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="wa-share-title"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 id="wa-share-title" className="text-[16px] font-bold text-text-primary">
              Share bill on WhatsApp
            </h2>
            <p className="text-[12px] text-text-muted">
              Bill {bill.billNo || bill.billId || "—"} · {inr(bill.grandTotal ?? bill.total ?? 0)}
            </p>
          </div>
          <button type="button" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-1" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label className="mb-2 grid gap-1 text-[12px] font-semibold text-text-muted">
          Customer name
          <input
            className="kg-input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name on bill"
            autoFocus
          />
        </label>
        <label className="mb-3 grid gap-1 text-[12px] font-semibold text-text-muted">
          WhatsApp number
          <input
            className="kg-input w-full"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile"
            inputMode="tel"
          />
        </label>

        {err ? <div className="mb-2 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] text-danger">{err}</div> : null}

        <div className="mb-3 max-h-28 overflow-y-auto rounded-lg border border-stroke-0 bg-bg-1 p-2 text-[11px] whitespace-pre-wrap text-text-secondary">
          {buildWhatsAppBillMessage(payload, settings)}
        </div>

        <div className="flex flex-col gap-2">
          <button type="button" className="kg-btn kg-btn-primary w-full" onClick={share}>
            Share on WhatsApp
          </button>
          <button type="button" className="kg-btn kg-btn-secondary w-full" onClick={pdfThenHint}>
            PDF bill (with regards)
          </button>
          <p className="text-[11px] text-text-muted">
            PDF opens print → Save as PDF. WhatsApp shares the bill text with regards. Attach the PDF in chat if needed.
          </p>
        </div>
      </div>
    </div>
  );
}
