import { useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { BRAND } from "@/lib/brand";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { LoadingLabel } from "@/components/ui/Loading";

export function LoginPage() {
  const { continueAsGuest } = usePosAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"idle" | "form" | "guest">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("form");
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
      sessionStorage.removeItem("kg_signed_out");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Invalid email or password.");
      } else if (code === "auth/email-already-in-use") {
        setError("That email is already registered. Try signing in.");
      } else if (code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
        setError(
          "Email/password sign-in is disabled. In Firebase Console → Authentication → Sign-in method, enable Email/Password."
        );
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setBusy("idle");
    }
  }

  async function onGuest() {
    setError(null);
    setBusy("guest");
    try {
      await continueAsGuest();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || "";
      if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
        setError(
          "Guest sign-in is disabled. In Firebase Console → Authentication → Sign-in method, enable Anonymous."
        );
      } else {
        setError(err instanceof Error ? err.message : "Guest sign-in failed.");
      }
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-bg-0 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary text-[14px] font-bold text-white">
            {BRAND.restaurantShort}
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-text-primary">{BRAND.appName}</h1>
          <p className="mt-1 text-[13px] text-text-muted">{BRAND.restaurantName} · sign in to continue</p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="rounded-[var(--radius-xl)] border border-stroke-0 bg-card-0 p-5 shadow-panel"
        >
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              className={`kg-btn flex-1 ${mode === "login" ? "kg-btn-primary" : "kg-btn-secondary"}`}
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`kg-btn flex-1 ${mode === "register" ? "kg-btn-primary" : "kg-btn-secondary"}`}
              onClick={() => setMode("register")}
            >
              Create account
            </button>
          </div>

          <label className="mb-3 grid gap-1 text-[12px] font-semibold text-text-muted">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              className="kg-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
            />
          </label>
          <label className="mb-4 grid gap-1 text-[12px] font-semibold text-text-muted">
            Password
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="kg-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>
          ) : null}

          <button type="submit" disabled={busy !== "idle"} className="kg-btn kg-btn-primary w-full !py-2.5 disabled:opacity-60">
            {busy === "form" ? <LoadingLabel>Please wait…</LoadingLabel> : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <span className="h-px flex-1 bg-stroke-0" />
            or
            <span className="h-px flex-1 bg-stroke-0" />
          </div>

          <button
            type="button"
            disabled={busy !== "idle"}
            onClick={() => void onGuest()}
            className="kg-btn kg-btn-secondary w-full !py-2.5 disabled:opacity-60"
          >
            {busy === "guest" ? <LoadingLabel>Connecting…</LoadingLabel> : "Continue as guest (Admin)"}
          </button>
        </form>
      </div>
    </div>
  );
}
