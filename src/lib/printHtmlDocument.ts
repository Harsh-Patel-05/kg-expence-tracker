/** Print / Save-as-PDF without pop-up windows (iframe — never blocked). */
export function printHtmlDocument(html: string, options?: { title?: string }) {
  const title = escapeHtml(options?.title || "Document");
  const docHtml = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  @page { margin: 12mm; }
  @media print { body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { margin: 12px; color: #111; background: #fff; font-family: 'Noto Sans Devanagari', 'Segoe UI', system-ui, sans-serif; }
</style>
</head><body>${html}</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", options?.title || "Print");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const idoc = iframe.contentDocument || win?.document;
  if (!win || !idoc) {
    iframe.remove();
    throw new Error("Could not open print view");
  }

  idoc.open();
  idoc.write(docHtml);
  idoc.close();

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      // Keep iframe briefly so print preview can load assets
      window.setTimeout(cleanup, 1500);
    }
  };

  // Wait for fonts/layout before print
  window.setTimeout(triggerPrint, 350);
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
