import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "felcin-media";
  const forDownload = req.nextUrl.searchParams.get("dl") === "1";

  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // Only proxy Felcin's own Storage buckets — not all of storage.googleapis.com
  // (which would make this an open fetch proxy for every public GCS object).
  let parsed: URL;
  try { parsed = new URL(url); } catch { return NextResponse.json({ error: "Invalid url" }, { status: 400 }); }
  const FELCIN_BUCKETS = ["felcin.firebasestorage.app", "felcin.appspot.com"];
  const allowed =
    (parsed.hostname === "firebasestorage.googleapis.com" &&
      FELCIN_BUCKETS.some((b) => parsed.pathname.includes(`/b/${b}/`))) ||
    (parsed.hostname === "storage.googleapis.com" &&
      FELCIN_BUCKETS.some((b) => parsed.pathname.startsWith(`/${b}/`)));
  if (!allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ error: "Fetch failed" }, { status: 502 });

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    };

    if (forDownload) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    // Stream the response instead of buffering — avoids memory issues on large files
    return new NextResponse(res.body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Failed to proxy media" }, { status: 500 });
  }
}
