"use client";

import { useState, useEffect } from "react";
import FelcinLogo from "@/components/FelcinLogo";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth, canAccessApp } from "@/lib/auth";

type Platform = "ios" | "android" | "web";

function getPlatform(): Platform {
  if (typeof window === "undefined") return "web";
  const cap = (window as any).Capacitor;
  // Primary: Capacitor bridge
  if (cap?.isNativePlatform?.()) {
    const p = cap.getPlatform?.();
    if (p === "ios") return "ios";
    if (p === "android") return "android";
  }
  // Fallback: bundled apps serve from a custom scheme (felcin://, capacitor://, ionic://)
  // In that case use the user agent to identify the platform.
  try {
    const proto = window.location.protocol;
    if (proto !== "http:" && proto !== "https:") {
      const ua = navigator.userAgent || "";
      if (/iPhone|iPad|iPod/.test(ua)) return "ios";
      if (/Android/.test(ua)) return "android";
    }
  } catch {}
  return "web";
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [dob, setDob] = useState("");
  const [platform, setPlatform] = useState<Platform>("web");

  useEffect(() => {
    setPlatform(getPlatform());
  }, []);

  useEffect(() => {
    if (!loading && user && canAccessApp(user)) {
      router.replace("/");
    }
  }, [user, loading, router]);

  // While auth is resolving, show a blank screen so any transient redirect
  // to /login (spinner → timeout → /login → auth fires → /) is invisible.
  if (loading) {
    return <div className="fixed inset-0" style={{ background: "#111" }} />;
  }

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
        if (!dob) { setError("Please enter your date of birth."); setBusy(false); return; }
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        if (age < 17) { setError("You must be at least 17 years old to create an account."); setBusy(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        sendEmailVerification(cred.user).catch(() => {});
        // Stay busy — useEffect will redirect once onAuthStateChanged fires with the new user
        return;
      }
      await signInWithEmailAndPassword(auth, email, password);
      // Stay busy — useEffect redirects to "/" once onAuthStateChanged fires.
      // Calling router.replace here would navigate before auth context updates,
      // causing ProtectedLayout to see user=null and bounce back to /login.
      return;
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
          : code ? `Sign-in error: ${code}` : msg
      );
    }
    setBusy(false);
  };

  const handleGoogle = async () => {
    setError(""); setStep("Opening Google sign-in…"); setBusy(true);
    const currentPlatform = getPlatform();
    try {
      if (currentPlatform !== "web") {
        // iOS + Android: use native Capacitor plugin with legacy GoogleSignInClient
        // useCredentialManager: false required — Credential Manager gives error 10 on this setup
        const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
        // Sign out first to clear the native Google Sign-In cache — without this,
        // the plugin silently re-uses the last account without showing the picker
        try { await FirebaseAuthentication.signOut(); } catch {}
        const result = await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false });
        if (!result.credential?.idToken) throw new Error("No ID token returned");
        // In hybrid mode (loading live felcin.com URL), auth is the web Firebase SDK and
        // must be synced via signInWithCredential so onAuthStateChanged fires in the WebView.
        // In the static offline bundle auth is null — skip the call, native plugin handles it.
        let isNew = result.additionalUserInfo?.isNewUser ?? false;
        if (auth) {
          const credential = GoogleAuthProvider.credential(
            result.credential.idToken,
            result.credential.accessToken ?? null
          );
          const userCred = await signInWithCredential(auth, credential);
          isNew = userCred.user.metadata.creationTime === userCred.user.metadata.lastSignInTime;
        }
        window.location.href = isNew ? "/onboarding" : "/";
      } else {
        // Web browser: popup keeps the user on felcin.com, avoiding the felcin.firebaseapp.com
        // redirect which iOS/Android intercept as a Universal Link and open the native app
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        // Stay busy — useEffect redirects once onAuthStateChanged fires.
        // ProtectedLayout's onboarding check handles new-user routing to /onboarding.
        return;
      }
    } catch (err: unknown) {
      setStep("");
      const code = (err as { code?: string }).code || "";
      const msg = (err as { message?: string }).message || "Google sign-in failed";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setBusy(false); return;
      }
setError(
        code === "auth/popup-blocked"
          ? "Popup was blocked. Please allow popups for felcin.com and try again."
          : code === "auth/unauthorized-domain"
          ? "Domain not authorized for Google sign-in. Contact support."
          : code === "auth/account-exists-with-different-credential"
          ? "An account already exists with this email. Please sign in with email and password."
          : code === "auth/network-request-failed"
          ? "Network error. Check your internet connection and try again."
          : `Sign-in failed${code ? " (" + code + ")" : ""}: ${msg}`
      );
      setBusy(false);
    }
  };

  const handleApple = async () => {
    setError(""); setStep("Opening Apple sign-in…"); setBusy(true);
    try {
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      const result = await FirebaseAuthentication.signInWithApple();
      if (!result.credential?.idToken) throw new Error("No ID token returned");
      let isNew = result.additionalUserInfo?.isNewUser ?? false;
      if (auth) {
        const provider = new OAuthProvider("apple.com");
        const credential = provider.credential({
          idToken: result.credential.idToken,
          rawNonce: result.credential.nonce ?? undefined,
        });
        const userCred = await signInWithCredential(auth, credential);
        isNew = userCred.user.metadata.creationTime === userCred.user.metadata.lastSignInTime;
      }
      window.location.href = isNew ? "/onboarding" : "/";
    } catch (err: unknown) {
      setStep("");
      const code = (err as { code?: string }).code || "";
      const msg = (err as { message?: string }).message || "Apple sign-in failed";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setBusy(false); return;
      }
      setError(`Sign-in failed${code ? " (" + code + ")" : ""}: ${msg}`);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#111" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3"><FelcinLogo size={56} /></div>
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
          {step && (
            <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "#aaa", border: "1px solid rgba(255,255,255,0.15)" }}>
              {step}
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
              <div>
                <label className="block text-xs mb-1.5" style={{ color: "#666" }}>Date of Birth</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  max={new Date(new Date().setFullYear(new Date().getFullYear() - 17)).toISOString().split("T")[0]}
                  required
                  className="w-full px-4 py-3 rounded-xl outline-none"
                  style={{ background: "#111", border: "1px solid #333", color: "#f1f1f1", fontSize: 16 }}
                />
              </div>
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
                  I agree to Felcin&apos;s{" "}
                  <a href="/terms" target="_blank" style={{ color: "#aaa", textDecoration: "underline" }}>Terms of Service</a>,{" "}
                  <a href="/privacy" target="_blank" style={{ color: "#aaa", textDecoration: "underline" }}>Privacy Policy</a>, and{" "}
                  <a href="/guidelines" target="_blank" style={{ color: "#aaa", textDecoration: "underline" }}>Community Guidelines</a>.
                  I understand that objectionable content and abusive behavior are not tolerated and may result in account removal.
                </span>
              </label>
            )}
            <button
              type="submit"
              disabled={busy || (mode === "signup" && (!agreedToTerms || !dob))}
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
              <div className="flex flex-col gap-3">
                {/* Google — shown on all platforms */}
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

                {/* Apple — shown only on iOS native */}
                {platform === "ios" && (
                  <button
                    onClick={handleApple}
                    disabled={busy}
                    className="w-full py-3 rounded-xl font-bold text-sm cursor-pointer border-none flex items-center justify-center gap-2"
                    style={{ background: "#fff", color: "#000", border: "1px solid #333" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                      <path d="M12.525 0c.078.87-.248 1.74-.716 2.388-.468.65-1.235 1.157-2.002 1.092-.09-.845.29-1.72.742-2.34C11.013.49 11.836 0 12.525 0zM15.75 12.37c-.382.962-.566 1.39-1.058 2.24-.686 1.17-1.655 2.63-2.858 2.642-.936.012-1.248-.588-2.329-.583-1.08.006-1.413.6-2.358.588-1.2-.014-2.117-1.34-2.804-2.51C2.37 11.89 2.25 8.758 3.344 7.09c.762-1.19 1.97-1.888 3.112-1.888 1.157 0 1.884.596 2.843.596.93 0 1.497-.598 2.836-.598 1.024 0 2.107.558 2.862 1.524-2.513 1.376-2.106 4.966.753 5.646z"/>
                    </svg>
                    Continue with Apple
                  </button>
                )}
              </div>
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
