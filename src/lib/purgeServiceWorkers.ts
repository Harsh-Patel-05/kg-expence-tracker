const PURGE_FLAG = "kg_sw_purged_20261124d";

/**
 * Fully remove legacy KDS service workers that broke /pos.
 * Does NOT register a new worker (registration itself caused fetch issues).
 */
export async function purgeLegacyServiceWorkers(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const regs = await navigator.serviceWorker.getRegistrations();
  const controlled = Boolean(navigator.serviceWorker.controller);
  if (!regs.length && !controlled) return;

  await Promise.all(regs.map((r) => r.unregister().catch(() => false)));

  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
  }

  try {
    if ((controlled || regs.length) && !sessionStorage.getItem(PURGE_FLAG)) {
      sessionStorage.setItem(PURGE_FLAG, "1");
      location.reload();
    }
  } catch {
    /* ignore */
  }
}

export function listenForServiceWorkerPurge(): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }
  const onMsg = (event: MessageEvent) => {
    if (event.data?.type !== "KG_SW_PURGED") return;
    try {
      if (!sessionStorage.getItem(PURGE_FLAG)) {
        sessionStorage.setItem(PURGE_FLAG, "1");
        location.reload();
      }
    } catch {
      /* ignore */
    }
  };
  navigator.serviceWorker.addEventListener("message", onMsg);
  return () => navigator.serviceWorker.removeEventListener("message", onMsg);
}
