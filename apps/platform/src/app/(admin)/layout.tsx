import { requireUser } from "@/lib/session";
import { AdminShell } from "@/components/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AdminShell user={{ name: user.name, email: user.email, role: user.role }}>{children}</AdminShell>
  );
}
