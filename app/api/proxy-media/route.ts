import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "felcin-media";
  const forDownload = req.nextUrl.searchParams.get("dl") === "1";

  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  if (!url.includes("firebasestorage.googleapis.com") && !url.includes("storage.googleapis.com")) {
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
