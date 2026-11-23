/**
 * POS feature barrel — extend existing web/ React app.
 * Products reuse Firestore `menuItems`; orders reuse `orders`.
 */
export { PosPage } from "./pages/PosPage";
export { usePosStore } from "./store/posStore";
export { PosAuthProvider, usePosAuth } from "./auth/PosAuthProvider";
export * from "./types";
