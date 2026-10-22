import Concierge from "@/components/Concierge";

// The admin assistant lives ONLY inside the admin panel (not floating on member pages).
// Concierge self-gates on OWNER_UIDS / admin email, so it still only renders for admins.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Concierge />
    </>
  );
}
