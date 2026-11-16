/**
 * Money math in paise (integers). Pure — safe for Node tests + browser.
 * window.KG.money / module.exports
 */
(function (root) {
  "use strict";

  function toPaise(rupees) {
    const n = Number(rupees);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function fromPaise(paise) {
    return (Number(paise) || 0) / 100;
  }

  function formatINR(rupees) {
    const n = Number(rupees) || 0;
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
      }).format(n);
    } catch (_) {
      return "₹" + n.toFixed(2);
    }
  }

  /**
   * @param {object} opts
   * @param {number} opts.subtotalPaise
   * @param {number} [opts.discountPaise] flat discount in paise
   * @param {number} [opts.discountPercent] 0–100
   * @param {number} [opts.chargesPaise] packaging/service
   * @param {number} [opts.gstPercent] default 5
   * @param {boolean} [opts.gstEnabled]
   * @param {boolean} [opts.gstInclusive] if true, GST is extracted from (subtotal-discount+charges)
   * @param {boolean} [opts.roundOff] round to nearest rupee
   */
  function computeBill(opts) {
    const subtotalPaise = Math.max(0, Math.round(Number(opts.subtotalPaise) || 0));
    let discountPaise = Math.max(0, Math.round(Number(opts.discountPaise) || 0));
    const discountPercent = Math.max(0, Math.min(100, Number(opts.discountPercent) || 0));
    if (discountPercent > 0) {
      discountPaise = Math.round((subtotalPaise * discountPercent) / 100);
    }
    const chargesPaise = Math.max(0, Math.round(Number(opts.chargesPaise) || 0));
    const gstEnabled = opts.gstEnabled !== false;
    const gstPercent = Math.max(0, Number(opts.gstPercent != null ? opts.gstPercent : 5));
    const gstInclusive = !!opts.gstInclusive;

    let taxablePaise = Math.max(0, subtotalPaise - discountPaise + chargesPaise);
    let gstPaise = 0;
    let netBeforeGst = taxablePaise;

    if (gstEnabled && gstPercent > 0) {
      if (gstInclusive) {
        netBeforeGst = Math.round(taxablePaise / (1 + gstPercent / 100));
        gstPaise = taxablePaise - netBeforeGst;
      } else {
        gstPaise = Math.round((taxablePaise * gstPercent) / 100);
        netBeforeGst = taxablePaise;
      }
    }

    let grandPaise = gstInclusive ? taxablePaise : taxablePaise + gstPaise;
    let roundOffPaise = 0;
    if (opts.roundOff) {
      const rounded = Math.round(grandPaise / 100) * 100;
      roundOffPaise = rounded - grandPaise;
      grandPaise = rounded;
    }

    return {
      subtotalPaise,
      discountPaise,
      chargesPaise,
      gstPaise,
      netRevenuePaise: netBeforeGst, // excluding GST
      roundOffPaise,
      grandPaise,
      subtotal: fromPaise(subtotalPaise),
      discount: fromPaise(discountPaise),
      charges: fromPaise(chargesPaise),
      gst: fromPaise(gstPaise),
      netRevenue: fromPaise(netBeforeGst),
      roundOff: fromPaise(roundOffPaise),
      grandTotal: fromPaise(grandPaise)
    };
  }

  /**
   * Validate payment split sums to grand total (paise).
   * @returns {{ ok: boolean, totalPaidPaise: number, diffPaise: number }}
   */
  function validateSplit(grandPaise, parts) {
    const cash = Math.max(0, Math.round(Number(parts.cashPaise) || 0));
    const online = Math.max(0, Math.round(Number(parts.onlinePaise) || 0));
    const swiggy = Math.max(0, Math.round(Number(parts.swiggyPaise) || 0));
    const zomato = Math.max(0, Math.round(Number(parts.zomatoPaise) || 0));
    const totalPaidPaise = cash + online + swiggy + zomato;
    const target = Math.round(Number(grandPaise) || 0);
    const diffPaise = totalPaidPaise - target;
    return { ok: Math.abs(diffPaise) <= 1, totalPaidPaise, diffPaise, cash, online, swiggy, zomato };
  }

  function changeDue(grandPaise, receivedPaise) {
    return Math.max(0, Math.round(Number(receivedPaise) || 0) - Math.round(Number(grandPaise) || 0));
  }

  const api = {
    toPaise,
    fromPaise,
    formatINR,
    computeBill,
    validateSplit,
    changeDue
  };

  root.KG = root.KG || {};
  root.KG.money = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
