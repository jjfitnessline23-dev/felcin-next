/**
 * Server-side view counter (creator-fund payouts depend on this).
 *
 * Viewers cannot write another user's totalViews / monthlyViews — Firestore rules
 * (correctly) deny cross-user writes, so the old client-side increments were silently
 * denied and views (→ creator-fund payouts) were under-counted. This route uses the
 * Admin SDK to record the view server-side, with atomic per-viewer dedup so a single
 * viewer only ever counts once per piece of content, and self-views never count.
 */
export const dynamic = "force-dynamic";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import admin from "firebase-admin";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { contentId, contentType } = body;
  if (!contentId) return NextResponse.json({ error: "Missing contentId" }, { status: 400 });

  const viewerUid = await verifyToken(req.headers.get("authorization") ?? body?.token);
  if (!viewerUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Soft cap on how fast one account can register views (real users scroll fast, so
  // keep this generous — it only exists to blunt scripted abuse).
  if (!await rateLimit(`view:${viewerUid}`, 300, 60_000)) {
    return NextResponse.json({ ok: true, throttled: true });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const db = app.firestore();

  const col = contentType === "reel" ? "reels" : "posts";
  const contentRef = db.collection(col).doc(String(contentId));
  const snap = await contentRef.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const authorId = String(snap.data()?.authorId || "");
  // A creator can't inflate their own view count.
  if (!authorId || authorId === viewerUid) {
    return NextResponse.json({ ok: true, counted: false });
  }

  // Atomic dedup: create() throws ALREADY_EXISTS if this viewer already viewed this
  // content, so each unique viewer counts exactly once (no race, no double-count).
  const viewerRef = contentRef.collection("viewers").doc(viewerUid);
  try {
    await viewerRef.create({ at: admin.firestore.FieldValue.serverTimestamp() });
  } catch {
    return NextResponse.json({ ok: true, counted: false });
  }

  const month = new Date().toISOString().slice(0, 7);
  await Promise.all([
    contentRef.update({ viewCount: admin.firestore.FieldValue.increment(1) }),
    db.collection("users").doc(authorId).update({ totalViews: admin.firestore.FieldValue.increment(1) }),
    db.collection("users").doc(authorId).collection("monthlyViews").doc(month)
      .set({ views: admin.firestore.FieldValue.increment(1) }, { merge: true }),
  ]).catch(() => {});

  return NextResponse.json({ ok: true, counted: true });
}
