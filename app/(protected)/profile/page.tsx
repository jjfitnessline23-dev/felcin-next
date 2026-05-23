"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user) router.replace(`/user-profile?uid=${user.uid}`);
  }, [user, router]);
  return <div className="flex justify-center py-20"><div className="spinner" /></div>;
}
