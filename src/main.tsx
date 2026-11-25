import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import { RouteErrorBoundary } from "@/components/ui/RouteErrorBoundary";
import { listenForServiceWorkerPurge, purgeLegacyServiceWorkers } from "@/lib/purgeServiceWorkers";
import "./styles/globals.css";

function Root() {
  const [boot, setBoot] = useState(0);
  const lastRemount = useRef(0);

  useEffect(() => {
    void purgeLegacyServiceWorkers();
    const stopListen = listenForServiceWorkerPurge();

    const recover = (msg: string) => {
      // Only remount on Firestore client fatal asserts — not routine permission denials
      if (!/INTERNAL ASSERTION FAILED/i.test(msg)) return;
      const now = Date.now();
      if (now - lastRemount.current < 2500) return;
      lastRemount.current = now;
      setBoot((n) => n + 1);
    };
    const onError = (e: ErrorEvent) => {
      recover(String(e.message || e.error || ""));
    };
    const onReject = (e: PromiseRejectionEvent) => {
      recover(String((e.reason as any)?.message || e.reason || ""));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      stopListen();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);

  return (
    <RouteErrorBoundary key={boot} label="root">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RouteErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
