// Client-side helper: upload a file straight to Cloudinary using a server-signed
// request, then return a delivery URL that auto-formats/optimizes for every device.

export interface CloudinaryResult {
  url: string;          // delivery URL with f_auto,q_auto (compatible everywhere)
  publicId: string;
  resourceType: string; // "image" | "video"
}

export async function uploadToCloudinary(
  file: File,
  getToken: () => Promise<string | undefined | null>,
  onProgress?: (pct: number) => void,
): Promise<CloudinaryResult> {
  const token = await getToken();
  const signRes = await fetch("/api/cloudinary-sign", {
    method: "POST",
    headers: { authorization: `Bearer ${token ?? ""}` },
  });
  if (!signRes.ok) throw new Error(`sign failed (${signRes.status})`);
  const { cloudName, apiKey, timestamp, folder, signature } = await signRes.json();

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

  // XHR (not fetch) so we get real upload-progress events for the progress bar.
  const result = await new Promise<Record<string, any>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("parse error")); }
      } else {
        reject(new Error(`upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(form);
  });

  const secureUrl = String(result.secure_url || "");
  const resourceType = String(result.resource_type || "image");
  // Insert f_auto,q_auto so Cloudinary delivers the best compatible/optimized format
  // per device+browser (e.g. an iPhone HEVC .mov is served as h264/mp4 to Android/web).
  const url = secureUrl.replace("/upload/", "/upload/f_auto,q_auto/");
  return { url, publicId: String(result.public_id || ""), resourceType };
}
