import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

admin.initializeApp();
const db = admin.firestore();

// Use bundled binary; fall back to system FFmpeg if somehow missing
ffmpeg.setFfmpegPath((ffmpegStatic as string) || "/usr/bin/ffmpeg");

// ─── Auth trigger ──────────────────────────────────────────────────────────────

function deriveNameFromEmail(email: string): string {
  return email
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  const profile = {
    displayName: user.displayName || deriveNameFromEmail(user.email || ""),
    photoURL: user.photoURL || "",
    email: user.email || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await Promise.all([
    db.doc(`users/${user.uid}`).set(profile, { merge: true }),
    db.doc(`users/${user.uid}/public/profile`).set(profile, { merge: true }),
  ]);
  console.log(`Created Firestore doc for new user: ${user.uid} (${user.email})`);
});

// ─── Video watermark helpers ───────────────────────────────────────────────────

function storagePathFromUrl(mediaUrl: string): string | null {
  try {
    const u = new URL(mediaUrl);
    const parts = u.pathname.split("/o/");
    if (parts.length < 2) return null;
    return decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
}

async function processVideoWatermark(
  mediaUrl: string,
  collection: string,
  docId: string,
  authorId: string
): Promise<void> {
  const storagePath = storagePathFromUrl(mediaUrl);
  if (!storagePath) {
    console.error(`[watermark] Cannot parse storage path from: ${mediaUrl}`);
    return;
  }

  const bucket     = admin.storage().bucket();
  const tmpDir     = os.tmpdir();
  const inputPath  = path.join(tmpDir, `${docId}_in.mp4`);
  const outputPath = path.join(tmpDir, `${docId}_out.mp4`);

  try {
    console.log(`[watermark] Downloading ${storagePath}`);
    await bucket.file(storagePath).download({ destination: inputPath });
    console.log(`[watermark] Downloaded. Running FFmpeg for ${docId}`);

    // drawtext watermark — bottom-right, proportional to frame height.
    // Escape colon in "felcin.com" for FFmpeg filter syntax.
    // Font size h/20, white text, semi-transparent black box behind it.
    const drawtext = [
      "drawtext=text='felcin.com'",
      "fontsize=h/20",
      "fontcolor=white@0.95",
      "x=w-tw-w*0.025",
      "y=h-th-h*0.025",
      "box=1",
      "boxcolor=0x000000AA",
      "boxborderw=12",
      "font=DejaVu Sans Bold",
    ].join(":");

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          `-vf`, drawtext,
          `-map`, `0:a?`,
          `-codec:a`, `copy`,
          `-codec:v`, `libx264`,
          `-preset`, `fast`,
          `-crf`, `26`,
          `-pix_fmt`, `yuv420p`,
          `-movflags`, `+faststart`,
        ])
        .output(outputPath)
        .on("end",   () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    console.log(`[watermark] FFmpeg done. Uploading watermarked video.`);
    const wmPath = `watermarked/${authorId}/${docId}.mp4`;
    await bucket.upload(outputPath, {
      destination: wmPath,
      metadata: { contentType: "video/mp4" },
    });

    // Attach a permanent download token so the URL matches Firebase Storage format
    const token = crypto.randomUUID();
    await bucket.file(wmPath).setMetadata({
      metadata: { firebaseStorageDownloadTokens: token },
    });
    const downloadUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
      `/o/${encodeURIComponent(wmPath)}?alt=media&token=${token}`;

    // Extract thumbnail from first 0.5 s of the ORIGINAL video (clean, no watermark)
    const thumbPath = path.join(tmpDir, `${docId}_thumb.jpg`);
    let thumbnailUrl: string | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .screenshots({ count: 1, timemarks: ["0.5"], filename: `${docId}_thumb.jpg`, folder: tmpDir })
          .on("end", () => resolve())
          .on("error", reject);
      });
      const thumbStoragePath = `thumbnails/${authorId}/${docId}.jpg`;
      await bucket.upload(thumbPath, {
        destination: thumbStoragePath,
        metadata: { contentType: "image/jpeg" },
      });
      const thumbToken = crypto.randomUUID();
      await bucket.file(thumbStoragePath).setMetadata({
        metadata: { firebaseStorageDownloadTokens: thumbToken },
      });
      thumbnailUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
        `/o/${encodeURIComponent(thumbStoragePath)}?alt=media&token=${thumbToken}`;
      console.log(`[watermark] Thumbnail stored at ${thumbStoragePath}`);
    } catch (e) {
      console.warn(`[watermark] Thumbnail extraction failed (non-fatal):`, e);
    } finally {
      try { if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath); } catch {}
    }

    const update: Record<string, string> = { mediaUrlDownload: downloadUrl };
    if (thumbnailUrl) update.thumbnailUrl = thumbnailUrl;
    await db.collection(collection).doc(docId).update(update);
    console.log(`[watermark] Done — mediaUrlDownload + thumbnailUrl set for ${collection}/${docId}`);
  } finally {
    for (const f of [inputPath, outputPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}

function isVideoDoc(data: admin.firestore.DocumentData): boolean {
  const mt = (data.contentType || data.mimeType || "") as string;
  return (
    mt === "video" ||
    mt.startsWith("video/") ||
    /\.(mp4|mov|webm|avi|3gp|m4v)(\?|$)/i.test(data.mediaUrl || "")
  );
}

// ─── Firestore triggers ────────────────────────────────────────────────────────

export const watermarkPostVideo = functions
  .runWith({ timeoutSeconds: 540, memory: "2GB" })
  .firestore.document("posts/{postId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data.mediaUrl || !isVideoDoc(data)) return;
    await processVideoWatermark(
      data.mediaUrl as string,
      "posts",
      context.params.postId,
      (data.authorId as string) || "unknown"
    );
  });

export const watermarkReelVideo = functions
  .runWith({ timeoutSeconds: 540, memory: "2GB" })
  .firestore.document("reels/{reelId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data.mediaUrl || !isVideoDoc(data)) return;
    await processVideoWatermark(
      data.mediaUrl as string,
      "reels",
      context.params.reelId,
      (data.authorId as string) || "unknown"
    );
  });
