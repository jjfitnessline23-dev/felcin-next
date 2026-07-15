export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";

function getAdmin() {
  if (admin.apps.length) return admin;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!sa) return null;
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    return admin;
  } catch { return null; }
}

const POLICY_PROMPT = `You are a strict content moderation AI for Felcin, a fitness social media platform.
Analyze the content for policy violations. Violation categories:
- hate_speech: attacks based on race, religion, gender, sexuality, disability, etc.
- explicit_content: nudity, sexual content, pornography
- violence: threats of harm, graphic violence, content glorifying violence
- harassment: bullying, targeted abuse, doxxing, intimidation of individuals
- spam: scam links, fake giveaways, unsolicited commercial content, bot behavior
- illegal_content: drug dealing, weapons sales, illegal services

Only flag clear, high-confidence violations. Do not flag fitness content, workout discussion, or mild language.

Respond ONLY with valid JSON, no other text:
{"violation":boolean,"category":"hate_speech"|"explicit_content"|"violence"|"harassment"|"spam"|"illegal_content"|"none","severity":"low"|"medium"|"high","reason":"brief explanation or empty string if no violation"}`;

async function analyzeContent(
  anthropic: Anthropic,
  text: string,
  imageUrl?: string
): Promise<{ violation: boolean; category: string; severity: string; reason: string }> {
  const content: Anthropic.MessageParam["content"] = [];

  if (imageUrl) {
    try {
      content.push({ type: "image", source: { type: "url", url: imageUrl } } as Anthropic.ImageBlockParam);
    } catch { /* skip image if URL inaccessible */ }
  }

  content.push({ type: "text", text: `Content to moderate:\n${text || "(no caption)"}` });

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: POLICY_PROMPT,
    messages: [{ role: "user", content }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  try {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      violation: json.violation ?? false,
      category: json.category ?? "none",
      severity: json.severity ?? "low",
      reason: json.reason ?? "",
    };
  } catch {
    return { violation: false, category: "none", severity: "low", reason: "" };
  }
}

async function applyViolation(
  db: admin.firestore.Firestore,
  userId: string,
  violation: { contentId: string; contentType: string; reason: string; category: string }
): Promise<"7d" | "30d" | "permanent" | "skipped"> {
  const userRef = db.collection("users").doc(userId);
  let banApplied: "7d" | "30d" | "permanent" | "skipped" = "skipped";

  await db.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    if (!userDoc.exists) return;

    const data = userDoc.data()!;

    // Skip permanently banned users
    if (data.banType === "permanent") return;

    const violations: unknown[] = data.violations ?? [];
    const count = violations.length + 1;

    const ban7 = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const ban30 = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    banApplied = count === 1 ? "7d" : count === 2 ? "30d" : "permanent";

    const newViolation = {
      contentId: violation.contentId,
      contentType: violation.contentType,
      reason: violation.reason,
      category: violation.category,
      date: admin.firestore.FieldValue.serverTimestamp(),
      banApplied,
    };

    const update: Record<string, unknown> = {
      violations: admin.firestore.FieldValue.arrayUnion(newViolation),
      banned: true,
      banReason: violation.reason,
      banSource: "ai-bot",
    };

    if (count === 1) {
      update.banType = "temporary";
      update.banUntil = ban7;
    } else if (count === 2) {
      update.banType = "temporary";
      update.banUntil = ban30;
    } else {
      update.banType = "permanent";
      update.banUntil = null;
    }

    tx.update(userRef, update);
  });

  return banApplied;
}

export async function POST(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const app = getAdmin();
  if (!app) return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });

  const db = app.firestore();
  const anthropic = new Anthropic({ apiKey });
  const results = { scanned: 0, violations: 0, bans: { "7d": 0, "30d": 0, permanent: 0 }, errors: 0 };

  // Fetch recent unmoderated posts and reels (last 48h)
  const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 48 * 60 * 60 * 1000));

  const [postsSnap, reelsSnap] = await Promise.all([
    db.collection("posts").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(60).get(),
    db.collection("reels").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(60).get(),
  ]);

  type ContentItem = { id: string; authorId: string; caption?: string; mediaUrl?: string; contentType?: string; collection: string };

  const items: ContentItem[] = [
    ...postsSnap.docs
      .filter((d) => !d.data().aiModerated)
      .map((d) => ({ id: d.id, collection: "posts", ...(d.data() as { authorId: string; caption?: string; mediaUrl?: string; contentType?: string }) })),
    ...reelsSnap.docs
      .filter((d) => !d.data().aiModerated)
      .map((d) => ({ id: d.id, collection: "reels", ...(d.data() as { authorId: string; caption?: string; mediaUrl?: string; contentType?: string }) })),
  ];

  // Process in batches of 5 to stay within rate limits
  for (let i = 0; i < items.length; i += 5) {
    const batch = items.slice(i, i + 5);
    await Promise.all(
      batch.map(async (item) => {
        try {
          // Only pass image URL for actual images (not videos)
          const isImage = item.mediaUrl && !item.mediaUrl.match(/\.(mp4|mov|webm)/i) && item.contentType?.startsWith("image");
          const imageUrl = isImage ? item.mediaUrl : undefined;

          const result = await analyzeContent(anthropic, item.caption ?? "", imageUrl);

          // Mark as AI-moderated regardless of outcome
          await db.collection(item.collection).doc(item.id).update({ aiModerated: true, aiModeratedAt: admin.firestore.FieldValue.serverTimestamp() });
          results.scanned++;

          if (result.violation && result.severity !== "low") {
            // Create report entry (shows up in admin Reports tab)
            await db.collection("reports").add({
              [item.collection === "posts" ? "postId" : "reelId"]: item.id,
              authorId: item.authorId,
              reporterId: "ai-bot",
              reason: `[AI Bot] ${result.category}: ${result.reason}`,
              type: item.collection === "posts" ? "post" : "reel",
              aiCategory: result.category,
              aiSeverity: result.severity,
              status: "pending",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            const banApplied = await applyViolation(db, item.authorId, {
              contentId: item.id,
              contentType: item.collection === "posts" ? "post" : "reel",
              reason: result.reason,
              category: result.category,
            });

            results.violations++;
            if (banApplied === "7d") results.bans["7d"]++;
            else if (banApplied === "30d") results.bans["30d"]++;
            else if (banApplied === "permanent") results.bans.permanent++;
          }
        } catch (err) {
          console.error(`Moderation error on ${item.id}:`, err);
          results.errors++;
        }
      })
    );
  }

  // Scan user profiles (display name + bio) — recent 30 unscanned users
  try {
    const usersSnap = await db.collection("users").orderBy("createdAt", "desc").limit(80).get();
    const unscannedUsers = usersSnap.docs.filter((d) => !d.data().bioModerated).slice(0, 30);

    for (let i = 0; i < unscannedUsers.length; i += 5) {
      const batch = unscannedUsers.slice(i, i + 5);
      await Promise.all(
        batch.map(async (userDoc) => {
          try {
            const data = userDoc.data();
            const text = `Username: ${data.displayName ?? ""}\nBio: ${data.bio ?? ""}`;
            const result = await analyzeContent(anthropic, text);

            await db.collection("users").doc(userDoc.id).update({ bioModerated: true });
            results.scanned++;

            if (result.violation && result.severity !== "low") {
              await db.collection("reports").add({
                authorId: userDoc.id,
                reporterId: "ai-bot",
                reason: `[AI Bot] Profile — ${result.category}: ${result.reason}`,
                type: "profile",
                aiCategory: result.category,
                aiSeverity: result.severity,
                status: "pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              const banApplied = await applyViolation(db, userDoc.id, {
                contentId: userDoc.id,
                contentType: "profile",
                reason: result.reason,
                category: result.category,
              });

              results.violations++;
              if (banApplied === "7d") results.bans["7d"]++;
              else if (banApplied === "30d") results.bans["30d"]++;
              else if (banApplied === "permanent") results.bans.permanent++;
            }
          } catch (err) {
            console.error(`Profile moderation error on ${userDoc.id}:`, err);
            results.errors++;
          }
        })
      );
    }
  } catch (err) {
    console.error("Profile scan error:", err);
  }

  // Log run to Firestore for admin visibility
  await db.collection("botLogs").add({
    type: "moderation",
    ...results,
    runAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, ...results });
}
