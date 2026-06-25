export function deriveNameFromEmail(email: string): string {
  const local = (email || "").split("@")[0];
  if (!local) return "";
  const cleaned = local
    .replace(/[._-]/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || local)
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
