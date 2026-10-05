import type { Metadata } from "next";
import PageClient from "./PageClient";

const FIREBASE_API_KEY = "AIzaSyCKmWO04sVRhxZv3EuK_j_53yup9K_LEeE";
const FIREBASE_PROJECT_ID = "felcin";

async function fetchPost(postId: string): Promise<{
  caption?: string; text?: string; mediaUrl?: string;
  contentType?: string; mimeType?: string;
  authorId?: string; authorName?: string;
} | null> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/posts/${postId}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.fields) return null;
    return {
      caption:     data.fields.caption?.stringValue,
      text:        data.fields.text?.stringValue,
      mediaUrl:    data.fields.mediaUrl?.stringValue,
      contentType: data.fields.contentType?.stringValue,
      mimeType:    data.fields.mimeType?.stringValue,
      authorId:    data.fields.authorId?.stringValue,
      authorName:  data.fields.authorName?.stringValue,
    };
  } catch { return null; }
}

async function fetchAuthorName(authorId: string): Promise<string | null> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${authorId}/public/profile?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (res.ok) {
      const data = await res.json();
      if (data.fields) return data.fields.displayName?.stringValue || data.fields.username?.stringValue || null;
    }
  } catch {}
  return null;
}

function isVideo(contentType?: string, mimeType?: string, url?: string) {
  // Check contentType AND mimeType independently so reels/stories (contentType
  // "reel"/"story", video type in mimeType) aren't mistaken for images.
  const ctl = (contentType || "").toLowerCase();
  const mil = (mimeType || "").toLowerCase();
  if (ctl === "video" || ctl.startsWith("video/")) return true;
  if (mil === "video" || mil.startsWith("video/")) return true;
  const u = url || "";
  return /\.(mp4|webm|mov|avi|3gp|m4v|mkv)(\?|$)/i.test(u) || /\/video\/upload\//i.test(u);
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ postId?: string }> }
): Promise<Metadata> {
  const { postId } = await searchParams;
  if (!postId) return { title: "Felcin" };

  const post = await fetchPost(postId);
  if (!post) return { title: "Felcin" };

  const authorName = (post.authorId ? await fetchAuthorName(post.authorId) : null)
    || post.authorName || "Felcin User";
  const caption = post.caption || post.text || "";
  const title = caption
    ? `${authorName}: ${caption.slice(0, 60)}${caption.length > 60 ? "…" : ""}`
    : `${authorName}'s post on Felcin`;
  const description = caption || `See ${authorName}'s workout post on Felcin`;
  const postUrl = `https://www.felcin.com/comments?postId=${postId}`;

  // Use post image as OG image; videos fall back to Felcin logo
  const ogImage = post.mediaUrl && !isVideo(post.contentType, post.mimeType, post.mediaUrl)
    ? [{ url: post.mediaUrl, width: 1080, height: 1080, alt: caption || "Felcin post" }]
    : [{ url: "https://www.felcin.com/logo512.png", width: 512, height: 512, alt: "Felcin" }];

  return {
    title,
    description,
    other: {
      "apple-itunes-app": `app-id=6763660775, app-argument=${postUrl}`,
    },
    openGraph: {
      title,
      description,
      url: postUrl,
      type: "article",
      images: ogImage,
      siteName: "Felcin",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage[0].url],
    },
  };
}

export default function Page() {
  return <PageClient />;
}
