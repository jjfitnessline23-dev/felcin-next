import { redirect } from "next/navigation";

// /help is the support/help center — it lives at /support. Redirect so any "Help"
// link (footer, nav) resolves instead of 404-ing.
export default function HelpPage() {
  redirect("/support");
}
