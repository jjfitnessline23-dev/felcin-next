import { MetadataRoute } from "next";
import { listPublicProfileUids } from "@/lib/publicProfile";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://www.felcin.com";
  const now = new Date();

  // Public, indexable athlete profiles — every one is an organic-discovery landing page.
  let profileEntries: MetadataRoute.Sitemap = [];
  try {
    const uids = await listPublicProfileUids(1000);
    profileEntries = uids.map((uid) => ({
      url: `${base}/u/${uid}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  } catch { profileEntries = []; }

  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/login`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${base}/support`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/guidelines`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/explore`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/reels`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...profileEntries,
  ];
}
