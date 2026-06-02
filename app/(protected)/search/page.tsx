"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SearchPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/explore"); }, [router]);
  return <div className="flex justify-center py-20"><div className="spinner" /></div>;
}
