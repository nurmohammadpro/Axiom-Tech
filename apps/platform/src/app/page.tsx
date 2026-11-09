import { redirect } from "next/navigation";

/**
 * The platform console is admin-only: shops never sign in here (they sign in
 * on their own subdomain). Shops are created by an admin under /tenants/new,
 * which hands the owner a one-time password.
 */
export default function RootPage() {
  redirect("/login");
}
