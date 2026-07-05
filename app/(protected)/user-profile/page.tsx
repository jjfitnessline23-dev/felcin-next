import type { Metadata } from "next";
import PageClient from "./PageClient";

const FIREBASE_API_KEY = "AIzaSyCKmWO04sVRhxZv3EuK_j_53yup9K_LEeE";
const FIREBASE_PROJECT_ID = "felcin";

async function fetchUserProfile(uid: string): Promise<{ displayName?: string; bio?: string; photoURL?: string; username?: string } | null> {
  try {
    // Try public/profile first
    const pubUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}/public/profile?key=${FIREBASE_API_KEY}`;
    const pubRes = await fetch(pubUrl, { next: { revalidate: 60 } });
    if (pubRes.ok) {
      const data = await pubRes.json();
      if (data.fields) {
        return {
          displayName: data.fields.displayName?.stringValue,
          bio: data.fields.bio?.stringValue,
          photoURL: data.fields.photoURL?.stringValue,
          username: data.fields.username?.stringValue,
        };
      }
    }
    // Fall back to root user doc
    const rootUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}?key=${FIREBASE_API_KEY}`;
    const rootRes = await fetch(rootUrl, { next: { revalidate: 60 } });
    if (rootRes.ok) {
      const data = await rootRes.json();
      if (data.fields) {
        return {
          displayName: data.fields.displayName?.stringValue,
          photoURL: data.fields.photoURL?.stringValue,
        };
      }
    }
  } catch {}
  return null;
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ uid?: string }> }
): Promise<Metadata> {
  const { uid } = await searchParams;
  if (!uid) return { title: "Felcin" };

  const profile = await fetchUserProfile(uid);
  if (!profile) return { title: "Felcin" };

  const name = profile.displayName || profile.username || "Felcin User";
  const description = profile.bio || `Follow ${name} on Felcin`;
  const url = `https://www.felcin.com/user-profile?uid=${uid}`;
  const images = profile.photoURL ? [{ url: profile.photoURL, width: 400, height: 400, alt: name }] : [];

  return {
    title: `${name} — Felcin`,
    description,
    other: {
      "apple-itunes-app": `app-id=6763660775, app-argument=https://www.felcin.com/user-profile?uid=${uid}`,
    },
    openGraph: {
      title: `${name} on Felcin`,
      description,
      url,
      type: "profile",
      images,
    },
    twitter: {
      card: "summary",
      title: `${name} on Felcin`,
      description,
      images: profile.photoURL ? [profile.photoURL] : [],
    },
  };
}

export default function Page() {
  return <PageClient />;
}
