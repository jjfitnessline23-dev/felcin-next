"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth, canAccessApp } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    if (!loading && user && canAccessApp(user)) {
      router.replace("/");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setInfo("Password reset email sent. Check your inbox.");
        setBusy(false); return;
      }
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(cred.user);
        setInfo("Account created! Please verify your email then log in.");
        await auth.signOut();
        setBusy(false); return;
      }
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      const msg = (err as { message?: string }).message || "Something went wrong";
      setError(
        code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password"
          ? "Email or password is incorrect."
          : code === "auth/email-already-in-use"
          ? "An account with this email already exists."
          : code === "auth/weak-password"
          ? "Password must be at least 6 characters."
          : code === "auth/too-many-requests"
          ? "Too many attempts. Please wait a few minutes and try again."
          : code === "auth/network-request-failed"
          ? "Network error. Check your internet connection and try again."
          : code === "auth/user-disabled"
          ? "This account has been disabled."
          : code
          ? `Sign-in error: ${code}`
          : msg
      );
    }
    setBusy(false);
  };

  const handleGoogle = async () => {
    setError(""); setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.replace("/");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      setError(
        code === "auth/popup-closed-by-user" ? "Sign-in cancelled."
        : code === "auth/popup-blocked" ? "Pop-up was blocked. Please allow pop-ups for this site."
        : code === "auth/unauthorized-domain" ? "This domain is not authorized for Google sign-in. Contact support."
        : code ? `Sign-in error: ${code}`
        : (err as { message?: string }).message || "Google sign-in failed"
      );
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#111" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/static/logo-nav.png" alt="Felcin" width={56} height={56} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold" style={{ color: "#f1f1f1" }}>Felcin</h1>
          <p className="text-sm mt-1" style={{ color: "#888" }}>
            {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background: "#1a1a1a", border: "1px solid #2a2a2a" }}>
          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "#ff6b6b", border: "1px solid rgba(239,68,68,0.3)" }}>
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 p-3 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.15)" }}>
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{ background: "#111", border: "1px solid #333", color: "#f1f1f1", fontSize: 16 }}
            />
            {mode !== "reset" && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl outline-none"
                style={{ background: "#111", border: "1px solid #333", color: "#f1f1f1", fontSize: 16 }}
              />
            )}
            {mode === "signup" && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 shrink-0"
                  style={{ width: 16, height: 16, accentColor: "#fff" }}
                />
                <span className="text-xs leading-relaxed" style={{ color: "#888" }}>
                  I agree to Felcin's{" "}
                  <a href="/terms" target="_blank" style={{ color: "#aaa", textDecoration: "underline" }}>Terms of Service</a>,{" "}
                  <a href="/privacy" target="_blank" style={{ color: "#aaa", textDecoration: "underline" }}>Privacy Policy</a>, and{" "}
                  <a href="/guidelines" target="_blank" style={{ color: "#aaa", textDecoration: "underline" }}>Community Guidelines</a>.
                  I understand that objectionable content and abusive behavior are not tolerated and may result in account removal.
                </span>
              </label>
            )}
            <button
              type="submit"
              disabled={busy || (mode === "signup" && !agreedToTerms)}
              className="w-full py-3 rounded-xl font-bold text-sm text-white cursor-pointer border-none"
              style={{ background: (busy || (mode === "signup" && !agreedToTerms)) ? "rgba(255,255,255,0.12)" : "#fff", color: (busy || (mode === "signup" && !agreedToTerms)) ? "#888" : "#000", opacity: 1 }}
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Email"}
            </button>
          </form>

          {mode !== "reset" && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px" style={{ background: "#2a2a2a" }} />
                <span className="text-xs" style={{ color: "#555" }}>or</span>
                <div className="flex-1 h-px" style={{ background: "#2a2a2a" }} />
              </div>
              <button
                onClick={handleGoogle}
                disabled={busy}
                className="w-full py-3 rounded-xl font-bold text-sm cursor-pointer border-none flex items-center justify-center gap-2"
                style={{ background: "#222", color: "#f1f1f1", border: "1px solid #333" }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}

          {/* Mode switches */}
          <div className="mt-4 text-center text-sm" style={{ color: "#666" }}>
            {mode === "login" && (
              <>
                <button onClick={() => { setMode("reset"); setError(""); setInfo(""); }} className="border-none bg-transparent cursor-pointer text-sm" style={{ color: "#aaa" }}>
                  Forgot password?
                </button>
                <span className="mx-2">·</span>
                <button onClick={() => { setMode("signup"); setError(""); setInfo(""); }} className="border-none bg-transparent cursor-pointer text-sm" style={{ color: "#aaa" }}>
                  Create account
                </button>
              </>
            )}
            {mode === "signup" && (
              <button onClick={() => { setMode("login"); setError(""); setInfo(""); }} className="border-none bg-transparent cursor-pointer text-sm" style={{ color: "#aaa" }}>
                Already have an account? Sign in
              </button>
            )}
            {mode === "reset" && (
              <button onClick={() => { setMode("login"); setError(""); setInfo(""); }} className="border-none bg-transparent cursor-pointer text-sm" style={{ color: "#aaa" }}>
                Back to sign in
              </button>
            )}
          </div>
        </div>

        {/* Policy footer */}
        <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
          <a href="/terms" target="_blank" className="text-xs" style={{ color: "#444", textDecoration: "none" }}>Terms</a>
          <a href="/privacy" target="_blank" className="text-xs" style={{ color: "#444", textDecoration: "none" }}>Privacy</a>
          <a href="/guidelines" target="_blank" className="text-xs" style={{ color: "#444", textDecoration: "none" }}>Guidelines</a>
          <span className="text-xs" style={{ color: "#2a2a2a" }}>© {new Date().getFullYear()} Felcin</span>
        </div>
      </div>
    </div>
  );
}
