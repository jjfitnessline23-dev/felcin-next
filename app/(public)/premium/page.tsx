import { redirect } from "next/navigation";

// /premium had no route (404). The Premium experience lives at /settings (which shows
// the Premium upsell to logged-out visitors and Premium management to signed-in users).
export default function PremiumPage() {
  redirect("/settings");
}
