"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, canAccessApp } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canAccessApp(user)) {
      router.replace("/login?verify=1");
    }
  }, [user, loading, router]);

  if (loading || !user || !canAccessApp(user)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#090909" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ background: "#090909", minHeight: "100dvh" }}>
      <Sidebar />
      <main className="lg:pl-60 pb-16 lg:pb-0 min-h-screen" style={{ width: "100%", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="w-full lg:max-w-[520px] lg:mx-auto">
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
