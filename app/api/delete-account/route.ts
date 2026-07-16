export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAdminApp } from "@/lib/firebaseAdmin";
import type { firestore } from "firebase-admin";

async function deleteCollection(col: firestore.CollectionReference) {
  const snap = await col.get();
  if (snap.empty) return;
  const db = col.firestore;
  const CHUNK = 400;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = db.batch();
    snap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteStoragePrefix(bucket: any, prefix: string) {
  try {
    const [files] = await bucket.getFiles({ prefix });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Promise.all(files.map((f: any) => f.delete().catch(() => {})));
  } catch {}
}

export async function DELETE(req: NextRequest) {
  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const db = app.firestore();
  const bucket = app.storage().bucket("felcin.firebasestorage.app");
  const userRef = db.collection("users").doc(uid);

  // User subcollections
  await Promise.all([
    deleteCollection(userRef.collection("followers")),
    deleteCollection(userRef.collection("following")),
    deleteCollection(userRef.collection("blocked")),
    deleteCollection(userRef.collection("blockedBy")),
    deleteCollection(userRef.collection("bookmarks")),
    deleteCollection(userRef.collection("workoutLogs")),
    deleteCollection(userRef.collection("moodLogs")),
    deleteCollection(userRef.collection("progressPhotos")),
    deleteCollection(userRef.collection("public")),
  ]);

  // Posts (with comments)
  const postsSnap = await db.collection("posts").where("authorId", "==", uid).get();
  await Promise.all(postsSnap.docs.map(async (d) => {
    await deleteCollection(d.ref.collection("comments"));
    await d.ref.delete();
  }));

  // Reels (with comments)
  const reelsSnap = await db.collection("reels").where("authorId", "==", uid).get();
  await Promise.all(reelsSnap.docs.map(async (d) => {
    await deleteCollection(d.ref.collection("comments"));
    await d.ref.delete();
  }));

  // Wills
  const willsSnap = await db.collection("wills").where("authorId", "==", uid).get();
  await Promise.all(willsSnap.docs.map((d) => d.ref.delete()));

  // Capsules
  const capsulesSnap = await db.collection("capsules").where("authorId", "==", uid).get();
  await Promise.all(capsulesSnap.docs.map((d) => d.ref.delete()));

  // Private chats — delete messages then the chat doc
  const chatsSnap = await db.collection("chats").where("participants", "array-contains", uid).get();
  await Promise.all(chatsSnap.docs.map(async (d) => {
    await deleteCollection(d.ref.collection("messages"));
    await d.ref.delete();
  }));

  // Notifications addressed to this user
  const notifSnap = await db.collection("notifications").where("toUid", "==", uid).get();
  if (!notifSnap.empty) {
    const CHUNK = 400;
    for (let i = 0; i < notifSnap.docs.length; i += CHUNK) {
      const batch = db.batch();
      notifSnap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // Delete user doc
  await userRef.delete();

  // Delete all Storage files
  await Promise.all([
    deleteStoragePrefix(bucket, `uploads/media/${uid}/`),
    deleteStoragePrefix(bucket, `uploads/avatars/${uid}/`),
    deleteStoragePrefix(bucket, `uploads/progress/${uid}/`),
    deleteStoragePrefix(bucket, `watermarked/${uid}/`),
    deleteStoragePrefix(bucket, `thumbnails/${uid}/`),
    deleteStoragePrefix(bucket, `ads/${uid}/`),
  ]);

  return NextResponse.json({ ok: true });
}
